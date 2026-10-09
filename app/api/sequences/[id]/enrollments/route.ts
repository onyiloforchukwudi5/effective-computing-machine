import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  if (!(await db.sequence.findFirst({ where: { id, userId: user.id } }))) throw new HttpError("Not found", 404);
  const rows = await db.sequenceEnrollment.findMany({ where: { sequenceId: id }, orderBy: { enrolledAt: "desc" }, take: 500, include: { contact: { select: { email: true, name: true } } } });
  return json(rows.map((e) => ({ id: e.id, email: e.contact.email, name: e.contact.name, status: e.status, currentStep: e.currentStep, nextSendAt: e.nextSendAt, stopReason: e.stopReason })));
});
