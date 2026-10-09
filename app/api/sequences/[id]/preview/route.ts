import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { renderMerge, renderStepHtml } from "@/lib/sequences";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const seq = await db.sequence.findFirst({ where: { id, userId: user.id } });
  if (!seq) throw new HttpError("Not found", 404);
  const d = await body(req, z.object({ contactId: z.string(), subject: z.string(), bodyHtml: z.string() }));
  const c = await db.contact.findFirst({ where: { id: d.contactId, userId: user.id } });
  if (!c) throw new HttpError("Contact not found", 404);
  return json({ subject: renderMerge(d.subject, c), html: renderStepHtml(d.bodyHtml, seq, c, user.id) });
});
