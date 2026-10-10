import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { verifyToken } from "@/lib/crypto";
import { OAUTH } from "@/lib/mail/transport";
import { rateLimit } from "@/lib/redis";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { appUrl, newAccountAllowed, signupsEnabled } from "@/lib/signup-guard";

type IdClaims = { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: unknown };

export async function GET(req: Request) {
  const base = appUrl() || new URL(req.url).origin;
  const done = (path: string) => {
    const res = NextResponse.redirect(`${base}${path}`);
    res.cookies.delete("g_nonce");
    return res;
  };
  const failed = () => done("/login?error=google_failed");
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    if (!(await rateLimit(`gcb:${ip}`, 30, 900))) return failed();
    const clientId = process.env[OAUTH.GOOGLE.idEnv];
    const secret = process.env[OAUTH.GOOGLE.secretEnv];
    if (!clientId || !secret) return done("/login?error=google_unavailable");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const st = verifyToken(url.searchParams.get("state") ?? "");
    const nonce = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith("g_nonce="))?.slice(8);
    if (!code || !st || st.f !== "signin" || !nonce || st.n !== nonce || Date.now() - Number(st.t) > 10 * 60_000) return failed();

    const tr = await fetch(OAUTH.GOOGLE.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: secret, grant_type: "authorization_code",
        redirect_uri: `${appUrl()}/api/auth/google/callback`,
      }),
    });
    if (!tr.ok) return failed();
    const idToken = ((await tr.json()) as { id_token?: string }).id_token;
    if (!idToken) return failed();
    const c = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as IdClaims;
    if ((c.iss !== "accounts.google.com" && c.iss !== "https://accounts.google.com") || c.aud !== clientId ||
        !c.exp || c.exp * 1000 <= Date.now() || !c.sub || !c.email) return failed();
    if (c.email_verified !== true) return done("/login?error=google_unverified");

    const email = c.email.toLowerCase();
    const sub = c.sub;
    const bySub = await db.user.findUnique({ where: { googleSub: sub } });
    const byEmail = bySub ? null : await db.user.findUnique({ where: { email } });
    let userId: string;
    if (bySub) {
      userId = bySub.id;
    } else if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== sub) return failed();
      userId = byEmail.id;
      if (byEmail.emailVerifiedAt) {
        await db.user.update({ where: { id: userId }, data: { googleSub: sub } });
      } else {
        // pending password sign-up: neutralise pre-hijacking
        await db.$transaction([
          db.user.update({
            where: { id: userId },
            data: { emailVerifiedAt: new Date(), googleSub: sub, passwordHash: await hashPassword(randomBytes(32).toString("base64url")) },
          }),
          db.session.deleteMany({ where: { userId } }),
          db.authToken.deleteMany({ where: { userId, usedAt: null } }),
        ]);
      }
    } else {
      if (!signupsEnabled()) return done("/login?error=signups_closed");
      if (isDisposableEmail(email)) return done("/login?error=domain_blocked");
      if (!(await newAccountAllowed())) return done("/login?error=signups_busy");
      userId = (
        await db.user.create({
          data: { email, googleSub: sub, emailVerifiedAt: new Date(), passwordHash: await hashPassword(randomBytes(32).toString("base64url")) },
        })
      ).id;
    }
    await createSession(userId);
    return done("/dashboard");
  } catch {
    return failed();
  }
}
