import argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id });
}
export async function verifyPassword(h: string, pw: string) {
  try {
    return await argon2.verify(h, pw);
  } catch {
    return false;
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { tokenHash: hash(token), userId, expiresAt: new Date(Date.now() + TTL_MS) } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await db.session.deleteMany({ where: { tokenHash: hash(t) } });
  jar.delete(COOKIE);
}

export type SessionUser = { id: string; email: string };

export async function currentUser(): Promise<SessionUser | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hash(t) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return { id: s.user.id, email: s.user.email };
}
