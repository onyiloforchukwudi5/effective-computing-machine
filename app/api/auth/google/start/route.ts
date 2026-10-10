import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { signToken } from "@/lib/crypto";
import { OAUTH } from "@/lib/mail/transport";
import { rateLimit } from "@/lib/redis";
import { appUrl } from "@/lib/signup-guard";

export async function GET(req: Request) {
  const to = (path: string) => NextResponse.redirect(`${appUrl() || new URL(req.url).origin}${path}`);
  const clientId = process.env[OAUTH.GOOGLE.idEnv];
  if (!clientId) return to("/login?error=google_unavailable");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`gstart:${ip}`, 30, 900))) return to("/login?error=google_failed");
  const nonce = randomBytes(16).toString("base64url");
  const state = signToken({ n: nonce, t: String(Date.now()), f: "signin" });
  const url = new URL(OAUTH.GOOGLE.authUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("g_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
