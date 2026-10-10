import { z } from "zod";
import { db } from "@/lib/db";
import { consumeAuthToken, hashPassword } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";
import { sendSiteEmail } from "@/lib/mail/site-mailer";
import { passwordChanged } from "@/lib/mail/site-templates";

const schema = z.object({ token: z.string().min(1).max(200), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`reset:${ip}`, 20, 3600))) return fail("Too many attempts", 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Password must be 8+ characters");
  const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return fail("This link is invalid or has expired");
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }),
    db.session.deleteMany({ where: { userId } }),
    db.authToken.updateMany({ where: { userId, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  await sendSiteEmail({ kind: "notice", to: user.email, ...passwordChanged() }).catch(() => {});
  return json({ ok: true });
}
