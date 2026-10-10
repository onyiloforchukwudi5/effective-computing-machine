import { z } from "zod";
import { db } from "@/lib/db";
import { createEmailCode } from "@/lib/auth";
import { json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";
import { sendSiteEmail } from "@/lib/mail/site-mailer";
import { verifyEmailCode } from "@/lib/mail/site-templates";

const schema = z.object({ email: z.string().email().toLowerCase() });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true });
  const { email } = parsed.data;
  if (!(await rateLimit(`resend:ip:${ip}`, 10, 3600)) || !(await rateLimit(`resend:email:${email}`, 3, 3600))) return json({ ok: true });
  // fire-and-forget so response time doesn't reveal whether the account exists
  void (async () => {
    const user = await db.user.findFirst({ where: { email, emailVerifiedAt: null } });
    if (!user) return;
    const newest = await db.authToken.findFirst({ where: { userId: user.id, purpose: "EMAIL_VERIFY" }, orderBy: { createdAt: "desc" } });
    if (newest && Date.now() - newest.createdAt.getTime() < 60_000) return;
    const code = await createEmailCode(user.id);
    await sendSiteEmail({ kind: "verify", to: email, ...verifyEmailCode(code) });
  })().catch(() => console.error("resend: failed"));
  return json({ ok: true });
}
