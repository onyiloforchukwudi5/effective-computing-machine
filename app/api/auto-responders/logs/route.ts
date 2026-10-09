import { db } from "@/lib/db";
import { authed, json } from "@/lib/api";

export const GET = authed(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const decision = sp.get("decision");
  const responderId = sp.get("responderId");
  const rows = await db.autoReplyLog.findMany({
    where: { responder: { userId: user.id, ...(responderId ? { id: responderId } : {}) }, ...(decision ? { decision } : {}) },
    orderBy: { createdAt: "desc" }, take: 200,
    include: { responder: { select: { name: true } }, message: { select: { subject: true } } },
  });
  const drafts = await db.aiDraft.findMany({ where: { id: { in: rows.map((r) => r.aiDraftId).filter((x): x is string => !!x) } }, select: { id: true, body: true, status: true } });
  const dm = new Map(drafts.map((d) => [d.id, d]));
  return json(rows.map((r) => ({
    id: r.id, responder: r.responder.name, messageId: r.messageId, subject: r.message.subject, contactEmail: r.contactEmail, decision: r.decision,
    reason: r.reason, error: r.error, createdAt: r.createdAt, draft: r.aiDraftId ? dm.get(r.aiDraftId) ?? null : null,
  })));
});
