import { z } from "zod";
import { db } from "@/lib/db";
import { aiErrorResponse, authed, body, HttpError, json } from "@/lib/api";
import { draftWithAi, threadContext } from "@/lib/ai/tasks";

const schema = z.object({ action: z.enum(["discard", "used", "regenerate"]) });

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const draft = await db.aiDraft.findFirst({ where: { id, userId: user.id }, include: { message: true } });
  if (!draft) throw new HttpError("Not found", 404);
  const { action } = await body(req, schema);
  if (action !== "regenerate") {
    await db.aiDraft.update({ where: { id }, data: { status: action === "discard" ? "discarded" : "used" } });
    return json({ ok: true });
  }
  try {
    const r = await draftWithAi(user.id, "regenerate", "Write a reply to the latest message in the thread.", await threadContext(draft.message));
    const u = await db.aiDraft.update({ where: { id }, data: { subject: r.subject, body: r.body, status: "pending" } });
    return json({ id: u.id, subject: u.subject, body: u.body });
  } catch (e) {
    const r = aiErrorResponse(e);
    if (r) return r;
    throw e;
  }
});
