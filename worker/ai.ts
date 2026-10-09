import type { Job } from "bullmq";
import { db } from "../lib/db";
import { queue, QUEUES } from "../lib/queues";
import { redis } from "../lib/redis";
import { AiLimitError } from "../lib/ai";
import { skipReason } from "../lib/ai/skip";
import { classifyNeedsReply, draftWithAi, threadContext } from "../lib/ai/tasks";
import { runResponder } from "../lib/autoresponder";
import type { NewInboxMessage } from "../lib/events";

const AUTO_DRAFT_MAX_AGE_DAYS = Number(process.env.AUTO_DRAFT_MAX_AGE_DAYS ?? 3);
const opts = { attempts: 3, backoff: { type: "exponential" as const, delay: 30_000 }, removeOnComplete: true, removeOnFail: 200 };

/** Subscriber for new Inbox messages: enqueue AI jobs (auto-draft + auto-responders). */
export async function aiInboundHandler(m: NewInboxMessage) {
  const acc = await db.mailAccount.findUnique({ where: { id: m.accountId }, select: { autoDraft: true } });
  if (acc?.autoDraft) await queue(QUEUES.ai).add("autodraft", { messageId: m.id }, { ...opts, jobId: `autodraft-${m.id}` });
  const rs = await db.autoResponder.findMany({ where: { accountId: m.accountId, enabled: true, paused: false }, select: { id: true } });
  for (const r of rs) await queue(QUEUES.ai).add("autoreply", { messageId: m.id, responderId: r.id }, { ...opts, jobId: `autoreply-${r.id}-${m.id}` });
}

export async function processAi(job: Job<{ messageId: string; responderId?: string }>) {
  const m = await db.message.findUnique({ where: { id: job.data.messageId }, include: { account: true } });
  if (!m) return;
  if (job.name === "autoreply") {
    const r = await db.autoResponder.findUnique({ where: { id: job.data.responderId } });
    if (r) await runResponder(r, m);
    return;
  }
  // auto-draft
  const userId = m.account.userId;
  if (!m.account.autoDraft) return;
  if (await db.aiDraft.findUnique({ where: { messageId: m.id } })) return; // one draft per message, idempotent
  if (await skipReason(m, userId, AUTO_DRAFT_MAX_AGE_DAYS)) return;
  try {
    const thread = await threadContext(m);
    const c = await classifyNeedsReply(userId, "autodraft-classify", m, thread);
    if (!c.needsReply) return;
    const d = await draftWithAi(userId, "autodraft", "Write a reply to the latest message in the thread.", thread);
    await db.aiDraft.upsert({
      where: { messageId: m.id }, update: {},
      create: { userId, messageId: m.id, accountId: m.accountId, subject: d.subject.startsWith("Re:") ? d.subject : `Re: ${m.subject ?? ""}`, body: d.body, note: c.reason ?? null },
    });
  } catch (e) {
    if (e instanceof AiLimitError) {
      await redis().set(`ai:capnotice:${userId}`, "1", "EX", 86_400); // surfaced in the UI
      return; // stop drafting; don't retry
    }
    throw e;
  }
}
