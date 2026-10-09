import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { nextWindowStart, stepDelayMs } from "@/lib/sequences";

const patch = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  sendVia: z.object({ type: z.enum(["ACCOUNT", "SMTP"]), id: z.string() }).nullable().optional(),
  timezone: z.string().optional(),
  sendDays: z.array(z.number().int().min(0).max(6)).optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(1).max(24).optional(),
  dailySendLimit: z.number().int().min(1).max(10000).optional(),
  hourlySendLimit: z.number().int().min(1).max(1000).optional(),
  stopOnReply: z.boolean().optional(),
  skipUnverified: z.boolean().optional(),
  saveCopyToSent: z.boolean().optional(),
  footerText: z.string().min(1).max(500).optional(),
  postalAddress: z.string().max(300).optional(),
  steps: z.array(z.object({
    id: z.string().optional(), subject: z.string().min(1).max(300), bodyHtml: z.string().max(100_000),
    delayDays: z.number().int().min(0).max(365), delayHours: z.number().int().min(0).max(23), sameThread: z.boolean(),
  })).max(20).optional(),
});

async function own(userId: string, id: string) {
  const s = await db.sequence.findFirst({ where: { id, userId }, include: { steps: { orderBy: { position: "asc" } } } });
  if (!s) throw new HttpError("Not found", 404);
  return s;
}

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json(await own(user.id, id)));

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const cur = await own(user.id, id);
  const { sendVia, steps, status, ...rest } = await body(req, patch);
  if (sendVia) {
    const ok = sendVia.type === "SMTP"
      ? await db.smtpSender.findFirst({ where: { id: sendVia.id, userId: user.id } })
      : await db.mailAccount.findFirst({ where: { id: sendVia.id, userId: user.id } });
    if (!ok) throw new HttpError("Sender not found", 404);
  }
  if (steps) {
    const keep = steps.filter((s) => s.id).map((s) => s.id!);
    const removed = cur.steps.filter((s) => !keep.includes(s.id));
    if (await db.sequenceSend.count({ where: { stepId: { in: removed.map((s) => s.id) } } })) throw new HttpError("Cannot delete a step that has already been sent");
    await db.$transaction([
      db.sequenceStep.deleteMany({ where: { sequenceId: id, id: { notIn: keep } } }),
      ...steps.map((s, i) => {
        const data = { position: i, subject: s.subject, bodyHtml: sanitizeEmailHtml(s.bodyHtml), delayDays: s.delayDays, delayHours: s.delayHours, sameThread: s.sameThread };
        return s.id && cur.steps.some((c) => c.id === s.id)
          ? db.sequenceStep.update({ where: { id: s.id }, data })
          : db.sequenceStep.create({ data: { ...data, sequenceId: id } });
      }),
    ]);
  }
  if (status === "active") {
    const via = sendVia ?? (cur.sendViaType ? { type: cur.sendViaType, id: cur.sendViaId } : null);
    const postal = rest.postalAddress ?? cur.postalAddress;
    const n = steps?.length ?? cur.steps.length;
    if (!via || !n) throw new HttpError("Choose a sender and add at least one step before activating");
    if (!postal.trim()) throw new HttpError("A postal address is required in the footer (CAN-SPAM/GDPR)");
  }
  await db.sequence.update({
    where: { id },
    data: { ...rest, ...(status ? { status } : {}), ...(sendVia !== undefined ? { sendViaType: sendVia?.type ?? null, sendViaId: sendVia?.id ?? null } : {}) },
  });
  if (status === "active") {
    // resume paused clock: enrollments without a next time get one now
    const s = await own(user.id, id);
    const due = await db.sequenceEnrollment.findMany({ where: { sequenceId: id, status: "active", nextSendAt: null } });
    for (const e of due) {
      const st = s.steps[e.currentStep];
      if (st) await db.sequenceEnrollment.update({ where: { id: e.id }, data: { nextSendAt: nextWindowStart(new Date(Date.now() + stepDelayMs(st)), s) } });
    }
  }
  return json(await own(user.id, id));
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await own(user.id, id);
  await db.sequence.delete({ where: { id } });
  return json({ ok: true });
});
