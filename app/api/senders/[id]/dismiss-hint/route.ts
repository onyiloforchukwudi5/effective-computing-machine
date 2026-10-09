import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const r = await db.smtpSender.updateMany({ where: { id, userId: user.id }, data: { hintDismissed: true } });
  if (!r.count) throw new HttpError("Not found", 404);
  return json({ ok: true });
});
