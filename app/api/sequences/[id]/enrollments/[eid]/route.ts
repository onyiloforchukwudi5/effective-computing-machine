import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { nextWindowStart } from "@/lib/sequences";

export const PATCH = authed<{ id: string; eid: string }>(async (req, user, { id, eid }) => {
  const en = await db.sequenceEnrollment.findFirst({ where: { id: eid, sequenceId: id, sequence: { userId: user.id } }, include: { sequence: true } });
  if (!en) throw new HttpError("Not found", 404);
  const { action } = await body(req, z.object({ action: z.enum(["pause", "resume", "remove"]) }));
  if (action === "remove") await db.sequenceEnrollment.delete({ where: { id: eid } });
  else if (action === "pause") await db.sequenceEnrollment.update({ where: { id: eid }, data: { status: "paused", stopReason: "Paused manually" } });
  else if (en.status === "paused") await db.sequenceEnrollment.update({ where: { id: eid }, data: { status: "active", stopReason: null, nextSendAt: nextWindowStart(new Date(), en.sequence) } });
  return json({ ok: true });
});
