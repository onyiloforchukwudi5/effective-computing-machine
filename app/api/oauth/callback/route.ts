import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, verifyToken } from "@/lib/crypto";
import { OAUTH } from "@/lib/mail/transport";
import { testAccount } from "@/lib/mail/test-connection";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const user = await currentUser();
  const st = verifyToken(u.searchParams.get("state") ?? "");
  const code = u.searchParams.get("code");
  const back = (q: string) => Response.redirect(`${process.env.APP_URL}/accounts?${q}`);
  if (!user || !st || st.u !== user.id || Date.now() - Number(st.t) > 600_000 || !code) return back("oauth=failed");
  const cfg = OAUTH[st.p as keyof typeof OAUTH];
  if (!cfg) return back("oauth=failed");
  const r = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env[cfg.idEnv] ?? "", client_secret: process.env[cfg.secretEnv] ?? "", code,
      grant_type: "authorization_code", redirect_uri: `${process.env.APP_URL}/api/oauth/callback`,
    }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token || !j.refresh_token || !j.id_token) return back("oauth=failed");
  const claims = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()) as { email?: string; preferred_username?: string };
  const email = claims.email ?? claims.preferred_username;
  if (!email) return back("oauth=failed");
  const acc = await db.mailAccount.create({
    data: {
      userId: user.id, label: `${st.p === "GOOGLE" ? "Gmail" : "Outlook"} ${email}`, email, method: st.p,
      refreshTokenEnc: encrypt(j.refresh_token), accessTokenEnc: encrypt(j.access_token),
      accessTokenExp: new Date(Date.now() + (j.expires_in ?? 3000) * 1000),
    },
  });
  const t = await testAccount(acc);
  await db.mailAccount.update({
    where: { id: acc.id },
    data: { status: t.ok ? "connected" : "error", lastError: t.ok ? null : [t.imap, t.smtp].filter((x) => x !== "OK").join(" | "), lastTestedAt: new Date() },
  });
  return back("oauth=ok");
}
