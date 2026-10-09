import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";

export const GET = authed(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const folderId = sp.get("folderId") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const size = 30;
  const folder = await db.folder.findFirst({ where: { id: folderId, account: { userId: user.id } } });
  if (!folder) throw new HttpError("Not found", 404);
  const [total, rows] = await Promise.all([
    db.message.count({ where: { folderId } }),
    db.message.findMany({
      where: { folderId }, orderBy: { receivedAt: "desc" }, skip: (page - 1) * size, take: size,
      select: { id: true, subject: true, fromName: true, fromEmail: true, receivedAt: true, flags: true, aiDraft: { select: { status: true, kind: true } }, autoReplyLogs: { select: { decision: true } } },
    }),
  ]);
  return json({
    total, page, size,
    rows: rows.map((m) => ({
      id: m.id, subject: m.subject, from: m.fromName || m.fromEmail, receivedAt: m.receivedAt, unread: !m.flags.includes("\\Seen"),
      aiDraft: m.aiDraft?.status === "pending" ? m.aiDraft.kind : null, handled: m.autoReplyLogs.some((l) => l.decision === "replied" || l.decision === "drafted"),
    })),
  });
});
