import { z } from "zod";
import { aiErrorResponse, authed, body, json } from "@/lib/api";
import { generateText, parseJsonLoose, profilePrompt, SAFETY_RULES } from "@/lib/ai";

const form = z.object({
  goal: z.string().min(1).max(500), audience: z.string().min(1).max(500), offer: z.string().max(1000).default(""),
  tone: z.string().max(100).default("professional"), steps: z.number().int().min(1).max(8).default(4), totalDays: z.number().int().min(1).max(120).default(14),
  regenerateStep: z.object({ index: z.number().int().min(0), existing: z.array(z.object({ subject: z.string(), bodyHtml: z.string() })) }).optional(),
});

const planSchema = z.object({
  steps: z.array(z.object({
    subject: z.string().min(1), body: z.string().min(1), delayDays: z.number().int().min(0).max(120),
    delayHours: z.number().int().min(0).max(23).default(0), sameThread: z.boolean(), rationale: z.string(),
  })).min(1).max(8),
});

const toHtml = (t: string) => t.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("");

/** Returns an unsaved draft plan only. Never activates, enrolls or sends. */
export const POST = authed(async (req, user) => {
  const d = await body(req, form);
  const profile = await profilePrompt(user.id);
  const system = `You plan cold/follow-up email sequences. ${SAFETY_RULES}
BUSINESS PROFILE:\n${profile.text}
Rules: use only these merge fields with fallbacks, e.g. {{firstName|there}}, {{lastName}}, {{email}}, {{company|your company}}. Do NOT include any unsubscribe text (added automatically). Do NOT invent discounts, case studies, statistics, customers or promises. Plain text bodies, no markdown.
Respond ONLY with JSON: {"steps":[{"subject":string,"body":string,"delayDays":int,"delayHours":int,"sameThread":boolean,"rationale":string (one line)}]}. The first step has delayDays 0.`;
  const task = d.regenerateStep
    ? `Rewrite ONLY step ${d.regenerateStep.index + 1} of this sequence (return exactly 1 step in "steps", keep its role in the flow). Goal: ${d.goal}. Audience: ${d.audience}. Offer: ${d.offer}. Tone: ${d.tone}.\nExisting steps:\n${d.regenerateStep.existing.map((s, i) => `${i + 1}. ${s.subject}`).join("\n")}`
    : `Plan a ${d.steps}-step sequence spanning about ${d.totalDays} days. Goal: ${d.goal}. Audience: ${d.audience}. Offer/value: ${d.offer}. Tone: ${d.tone}.`;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await generateText(user.id, "plan-sequence", { system, messages: [{ role: "user", content: task }], maxTokens: 2500, temperature: 0.6 });
      try {
        const plan = planSchema.parse(parseJsonLoose(out));
        return json({
          steps: plan.steps.map((s, i) => ({ subject: s.subject, bodyHtml: toHtml(s.body), delayDays: i === 0 && !d.regenerateStep ? 0 : s.delayDays, delayHours: s.delayHours, sameThread: i === 0 ? false : s.sameThread, rationale: s.rationale })),
        });
      } catch { /* malformed: retry once */ }
    }
    return json({ error: "The AI returned a malformed plan. Please try again." }, 502);
  } catch (e) {
    const r = aiErrorResponse(e);
    if (r) return r;
    throw e;
  }
});
