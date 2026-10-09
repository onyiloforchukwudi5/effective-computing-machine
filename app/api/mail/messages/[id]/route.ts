import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";
import { sanitizeIncoming } from "@/lib/sanitize";

export const GET = authed<{ id: string }>(async (req, user, { id }) => {
  const allowImages = new URL(req.url).searchParams.get("images") === "1"; // remote images blocked by default
  const m = await db.message.findFirst({
    where: { id, account: { userId: user.id } },
    include: { aiDraft: true, autoReplyLogs: { include: { responder: { select: { name: true } } } }, account: { select: { id: true, email: true, defaultSmtpSenderId: true } } },
  });
  if (!m) throw new HttpError("Not found", 404);
  return json({
    id: m.id, subject: m.subject, fromName: m.fromName, fromEmail: m.fromEmail, to: m.toAddrs, cc: m.ccAddrs, receivedAt: m.receivedAt,
    html: m.htmlBody ? sanitizeIncoming(m.htmlBody, allowImages) : null, hasRemoteImages: !!m.htmlBody && /<img[^>]+src=["']?https?:/i.test(m.htmlBody),
    text: m.textBody, attachments: m.attachments, accountId: m.accountId, accountEmail: m.account.email, linkedSenderId: m.account.defaultSmtpSenderId,
    aiDraft: m.aiDraft && m.aiDraft.status === "pending" ? { id: m.aiDraft.id, subject: m.aiDraft.subject, body: m.aiDraft.body, kind: m.aiDraft.kind, note: m.aiDraft.note } : null,
    autoReplies: m.autoReplyLogs.map((l) => ({ responder: l.responder.name, decision: l.decision, reason: l.reason })),
  });
});
