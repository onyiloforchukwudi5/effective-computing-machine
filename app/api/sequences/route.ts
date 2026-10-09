import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { sanitizeEmailHtml } from "@/lib/sanitize";

const stepSchemaShape = z.object({
  id: z.string().optional(),
  subject: z.string().min(1).max(300),
  bodyHtml: z.string().max(100_000),
  delayDays: z.number().int().min(0).max(365),
  delayHours: z.number().int().min(0).max(23),
  sameThread: z.boolean(),
});

const create = z.object({ name: z.string().min(1).max(120), steps: z.array(stepSchemaShape).max(20).optional() });

export const GET = authed(async (_req, user) => {
  const seqs = await db.sequence.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { enrollments: { select: { status: true } }, _count: { select: { steps: true } } } });
  return json(seqs.map((s) => {
    const c = (st: string) => s.enrollments.filter((e) => e.status === st).length;
    return { id: s.id, name: s.name, status: s.status, steps: s._count.steps, enrolled: s.enrollments.length, active: c("active"), replied: c("replied"), bounced: c("bounced"), unsubscribed: c("unsubscribed") };
  }));
});

export const POST = authed(async (req, user) => {
  const d = await body(req, create);
  const s = await db.sequence.create({
    data: {
      userId: user.id, name: d.name,
      steps: { create: (d.steps ?? []).map((st, i) => ({ position: i, subject: st.subject, bodyHtml: sanitizeEmailHtml(st.bodyHtml), delayDays: st.delayDays, delayHours: st.delayHours, sameThread: st.sameThread })) },
    },
  });
  return json({ id: s.id }, 201);
});
