import type { Job } from "bullmq";
import { randomBytes } from "crypto";
import { db } from "../lib/db";
import { queue, QUEUES } from "../lib/queues";
import { sendMail, SendError } from "../lib/mail/send";
import { inWindow, nextWindowStart, renderMerge, renderStepHtml, stepDelayMs, unsubscribeUrl } from "../lib/sequences";
import type { NewInboxMessage } from "../lib/events";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repeatable (every minute): enqueue send jobs for due enrollments. */
export async function schedulerTick() {
  const due = await db.sequenceEnrollment.findMany({
    where: { status: "active", nextSendAt: { lte: new Date() }, sequence: { status: "active" } },
    select: { id: true, currentStep: true }, take: 500,
  });
  for (const e of due) {
    await queue(QUEUES.sequences).add("send", { enrollmentId: e.id }, {
      jobId: `send-${e.id}-${e.currentStep}`, attempts: 5, backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true, removeOnFail: 500,
    });
  }
}

async function advance(enrollmentId: string, sequence: Parameters<typeof nextWindowStart>[1], steps: { delayDays: number; delayHours: number }[], current: number) {
  const next = steps[current + 1];
  if (!next) {
    await db.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "completed", currentStep: current + 1, nextSendAt: null, finishedAt: new Date(), stopReason: "All steps sent" } });
    return;
  }
  await db.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: { currentStep: current + 1, nextSendAt: nextWindowStart(new Date(Date.now() + stepDelayMs(next)), sequence) },
  });
}

export async function processSend(job: Job<{ enrollmentId: string }>) {
  const en = await db.sequenceEnrollment.findUnique({
    where: { id: job.data.enrollmentId },
    include: { contact: true, sequence: { include: { steps: { orderBy: { position: "asc" } } } } },
  });
  if (!en || en.status !== "active" || en.sequence.status !== "active") return;
  const seq = en.sequence;
  const userId = seq.userId;
  const step = seq.steps[en.currentStep];
  if (!step) {
    await db.sequenceEnrollment.update({ where: { id: en.id }, data: { status: "completed", finishedAt: new Date(), nextSendAt: null } });
    return;
  }
  if (!seq.sendViaType || !seq.sendViaId) return reschedule(en.id, 3600_000);
  const stop = (status: string, reason: string) =>
    db.sequenceEnrollment.update({ where: { id: en.id }, data: { status, stopReason: reason, finishedAt: new Date(), nextSendAt: null } });

  if (await db.unsubscribe.findUnique({ where: { userId_email: { userId, email: en.contact.email } } })) return void (await stop("unsubscribed", "On unsubscribe list"));
  if (seq.skipUnverified && en.contact.verificationStatus === "invalid") return void (await stop("failed", "Address verified as invalid"));
  if (!inWindow(new Date(), seq)) return void (await db.sequenceEnrollment.update({ where: { id: en.id }, data: { nextSendAt: nextWindowStart(new Date(), seq) } }));

  // daily + hourly caps per sender (rolling windows)
  const senderWhere = { status: "sent", enrollment: { sequence: { userId, sendViaType: seq.sendViaType, sendViaId: seq.sendViaId } } };
  for (const [limit, ms] of [[seq.dailySendLimit, 86_400_000], [seq.hourlySendLimit, 3_600_000]] as const) {
    const recent = await db.sequenceSend.findMany({ where: { ...senderWhere, sentAt: { gte: new Date(Date.now() - ms) } }, orderBy: { sentAt: "asc" }, select: { sentAt: true } });
    if (recent.length >= limit) {
      const when = new Date((recent[0].sentAt?.getTime() ?? Date.now()) + ms + 1000);
      return void (await db.sequenceEnrollment.update({ where: { id: en.id }, data: { nextSendAt: nextWindowStart(when, seq) } }));
    }
  }

  // idempotency: unique (enrollmentId, stepId); an orphaned row means we can't know if it went out, so never resend
  const existing = await db.sequenceSend.findUnique({ where: { enrollmentId_stepId: { enrollmentId: en.id, stepId: step.id } } });
  if (existing) {
    if (existing.status === "queued") await db.sequenceSend.update({ where: { id: existing.id }, data: { status: "failed", error: "Interrupted before confirmation; not retried to avoid a duplicate" } });
    if (existing.status === "bounced") return void (await stop("bounced", existing.error ?? "Bounced"));
    return advance(en.id, seq, seq.steps, en.currentStep);
  }
  const domain = (await senderDomain(userId, seq.sendViaType, seq.sendViaId)) ?? "localhost";
  const messageId = `<${randomBytes(12).toString("hex")}@${domain}>`;
  const row = await db.sequenceSend.create({ data: { enrollmentId: en.id, stepId: step.id, messageIdHeader: messageId, status: "queued" } });

  const first = step.sameThread && step.position > 0
    ? await db.sequenceSend.findFirst({ where: { enrollmentId: en.id, status: "sent" }, orderBy: { sentAt: "asc" }, include: { step: true } })
    : null;
  const subject = first ? `Re: ${renderMerge(first.step.subject, en.contact).replace(/^re:\s*/i, "")}` : renderMerge(step.subject, en.contact);
  const url = unsubscribeUrl(userId, en.contact.email);
  await sleep(1000 + Math.random() * 4000); // jitter between sends
  try {
    await sendMail({
      userId, via: { type: seq.sendViaType as "ACCOUNT" | "SMTP", id: seq.sendViaId }, to: [en.contact.email], subject,
      html: renderStepHtml(step.bodyHtml, seq, en.contact, userId), messageId,
      inReplyTo: first?.messageIdHeader, references: first?.messageIdHeader,
      headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      saveCopyAccountId: seq.saveCopyToSent && seq.sendViaType === "ACCOUNT" ? seq.sendViaId : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    if (e instanceof SendError && e.permanent) {
      await db.sequenceSend.update({ where: { id: row.id }, data: { status: "bounced", error: msg } });
      return void (await stop("bounced", msg));
    }
    await db.sequenceSend.delete({ where: { id: row.id } }); // known-not-sent: safe to retry
    throw e; // BullMQ backoff
  }
  await db.sequenceSend.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date() } });
  await advance(en.id, seq, seq.steps, en.currentStep);
}

const reschedule = (id: string, ms: number) =>
  db.sequenceEnrollment.update({ where: { id }, data: { nextSendAt: new Date(Date.now() + ms) } });

async function senderDomain(userId: string, type: string, id: string) {
  const email = type === "SMTP"
    ? (await db.smtpSender.findFirst({ where: { id, userId } }))?.fromEmail
    : (await db.mailAccount.findFirst({ where: { id, userId } }))?.email;
  return email?.split("@")[1];
}

/** Subscriber for new Inbox messages: reply + bounce detection. */
export async function sequenceInboundHandler(m: NewInboxMessage) {
  const active = { status: "active", sequence: { userId: m.userId } };
  const isDsn = /^(mailer-daemon|postmaster)@/i.test(m.fromEmail ?? "") || /multipart\/report|delivery-status/i.test(m.rawHeaders ?? "");
  if (isDsn) {
    const ids = Array.from(new Set(`${m.textBody ?? ""} ${m.rawHeaders ?? ""}`.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []));
    const sends = ids.length ? await db.sequenceSend.findMany({ where: { messageIdHeader: { in: ids }, enrollment: active } }) : [];
    for (const s of sends) {
      await db.sequenceSend.update({ where: { id: s.id }, data: { status: "bounced", error: "Bounce received" } });
      await db.sequenceEnrollment.update({ where: { id: s.enrollmentId }, data: { status: "bounced", stopReason: "Bounce message received", finishedAt: new Date(), nextSendAt: null } });
    }
    return;
  }
  if (m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no") return; // out-of-office is not a reply
  const refs = [m.inReplyTo, ...(m.references?.split(/\s+/) ?? [])].filter((x): x is string => !!x);
  const stopFilter = { ...active, sequence: { userId: m.userId, stopOnReply: true } };
  if (refs.length) {
    const sends = await db.sequenceSend.findMany({ where: { messageIdHeader: { in: refs }, enrollment: stopFilter }, select: { enrollmentId: true } });
    for (const s of sends) await db.sequenceEnrollment.update({ where: { id: s.enrollmentId }, data: { status: "replied", stopReason: "Reply received", finishedAt: new Date(), nextSendAt: null } });
  }
  if (m.fromEmail) {
    await db.sequenceEnrollment.updateMany({
      where: { ...stopFilter, contact: { userId: m.userId, email: m.fromEmail.toLowerCase() } },
      data: { status: "replied", stopReason: "Reply received", finishedAt: new Date(), nextSendAt: null },
    });
  }
}
