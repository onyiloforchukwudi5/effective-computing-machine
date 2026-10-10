import { z } from "zod";
import { db } from "@/lib/db";
import { createAuthToken } from "@/lib/auth";
import { json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";
import { sendSiteEmail } from "@/lib/mail/site-mailer";
import { resetPassword } from "@/lib/mail/site-templates";
import { appUrl } from "@/lib/signup-guard";

const schema = z.object({ email: z.string().email().toLowerCase() });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true });
  const { email } = parsed.data;
  if (!(await rateLimit(`forgot:ip:${ip}`, 10, 3600)) || !(await rateLimit(`forgot:email:${email}`, 3, 3600))) return json({ ok: true });
  void (async () => {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return;
    const token = await createAuthToken(user.id, "PASSWORD_RESET");
    await sendSiteEmail({ kind: "reset", to: email, ...resetPassword(`${appUrl()}/reset-password?token=${encodeURIComponent(token)}`) });
  })().catch(() => console.error("forgot: failed"));
  return json({ ok: true });
}
