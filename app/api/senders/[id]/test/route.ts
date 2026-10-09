import { db } from "@/lib/db";
import { authed, fail, HttpError, json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";
import { smtpSenderTransport } from "@/lib/mail/transport";
import { assertSafeTarget, errText } from "@/lib/net-guard";
import { withDeliverabilityHint } from "@/lib/deliverability";

/** Sends a test email to the user's own address and returns the server's real response. */
export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const s = await db.smtpSender.findFirst({ where: { id, userId: user.id } });
  if (!s) throw new HttpError("Not found", 404);
  if (!(await rateLimit(`sendertest:${user.id}`, 5, 600))) return fail("Too many test sends. Try again in a few minutes.", 429);
  try {
    await assertSafeTarget(s.host, s.port, "smtp");
    const info = await smtpSenderTransport(s).sendMail({
      from: { name: s.fromName, address: s.fromEmail }, to: user.email, replyTo: s.replyTo ?? undefined,
      subject: "Test email from Mail CRM", text: `This is a test email sent through your SMTP sender "${s.label}".`,
    });
    await db.smtpSender.update({ where: { id }, data: { status: "connected", lastError: null, lastTestedAt: new Date() } });
    return json({ ok: true, response: info.response });
  } catch (e) {
    const msg = withDeliverabilityHint(errText(e));
    await db.smtpSender.update({ where: { id }, data: { status: "error", lastError: msg, lastTestedAt: new Date() } });
    return json({ ok: false, response: msg });
  }
});
