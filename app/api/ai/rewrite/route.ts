import { z } from "zod";
import { aiErrorResponse, authed, body, json } from "@/lib/api";
import { rewrite } from "@/lib/ai/tasks";

const schema = z.object({ action: z.enum(["shorter", "longer", "friendlier", "formal", "grammar", "translate"]), text: z.string().min(1).max(10000), language: z.string().optional() });

export const POST = authed(async (req, user) => {
  const d = await body(req, schema);
  try {
    return json({ text: await rewrite(user.id, d.action, d.text, d.language), aiDraft: true });
  } catch (e) {
    const r = aiErrorResponse(e);
    if (r) return r;
    throw e;
  }
});
