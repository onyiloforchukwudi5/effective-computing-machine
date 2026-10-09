import { z } from "zod";
import { db } from "@/lib/db";
import { aiErrorResponse, authed, body, HttpError, json } from "@/lib/api";
import { draftWithAi, threadContext } from "@/lib/ai/tasks";
import { containsForbidden } from "@/lib/ai";

const schema = z.object({
  mode: z.enum(["draft", "suggest"]),
  instruction: z.string().max(2000).optional(),
  replyToMessageId: z.string().optional(),
});

/** Never sends anything: returns text for the editor, flagged as an AI draft. */
export const POST = authed(async (req, user) => {
  const d = await body(req, schema);
  try {
    let thread: string | undefined;
    if (d.replyToMessageId) {
      const m = await db.message.findFirst({ where: { id: d.replyToMessageId, account: { userId: user.id } } });
      if (!m) throw new HttpError("Message not found", 404);
      thread = await threadContext(m);
    }
    if (d.mode === "suggest" && !thread) throw new HttpError("Open a message to suggest a reply");
    const task = d.mode === "suggest"
      ? `Write a reply to the latest message in the thread.${d.instruction ? ` Extra guidance from the user: ${d.instruction}` : ""}`
      : `Write a complete email with a subject based on this instruction: ${d.instruction ?? ""}`;
    const r = await draftWithAi(user.id, d.mode === "suggest" ? "suggest-reply" : "draft", task, thread);
    const hit = containsForbidden(r.body, r.doNotSay);
    return json({ subject: r.subject, body: r.body, aiDraft: true, warning: hit ? `Draft contains a phrase from your do-not-say list: "${hit}"` : null });
  } catch (e) {
    const r = aiErrorResponse(e);
    if (r) return r;
    throw e;
  }
});
