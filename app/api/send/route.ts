import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json, fail } from "@/lib/api";
import { SendError, sendMail } from "@/lib/mail/send";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { rateLimit } from "@/lib/redis";

const schema = z.object({
  via: z.object({ type: z.enum(["ACCOUNT", "SMTP"]), id: z.string() }),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().max(998),
  html: z.string().max(500_000),
  replyToMessageId: z.string().optional(),
  saveCopy: z.boolean().optional(),
  aiDraftId: z.string().optional(),
});

export const POST = authed(async (req, user) => {
  const d = await body(req, schema);
  if (!(await rateLimit(`send:${user.id}`, 60, 3600))) return fail("Send rate limit reached", 429);
  let inReplyTo: string | undefined;
  let references: string | undefined;
  let copyAccount: string | null = null;
  if (d.replyToMessageId) {
    const m = await db.message.findFirst({ where: { id: d.replyToMessageId, account: { userId: user.id } } });
    if (!m) throw new HttpError("Message not found", 404);
    inReplyTo = m.messageIdHeader ?? undefined;
    references = [m.references, m.messageIdHeader].filter(Boolean).join(" ") || undefined;
    copyAccount = d.saveCopy ? m.accountId : null;
  } else if (d.saveCopy && d.via.type === "ACCOUNT") copyAccount = d.via.id;
  const html = sanitizeEmailHtml(d.html);
  try {
    const r = await sendMail({
      userId: user.id, via: d.via, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, html,
      text: html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""), inReplyTo, references, saveCopyAccountId: copyAccount,
    });
    if (d.aiDraftId) await db.aiDraft.updateMany({ where: { id: d.aiDraftId, userId: user.id }, data: { status: "used" } });
    return json({ ok: true, response: r.response });
  } catch (e) {
    if (e instanceof SendError) return json({ ok: false, error: e.message }, 502);
    throw e;
  }
});
