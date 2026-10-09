import { Queue } from "bullmq";
import { redis } from "./redis";

export const QUEUES = {
  sync: "sync",
  verify: "verify",
  sequences: "sequences",
  ai: "ai",
} as const;

const cache = new Map<string, Queue>();
export function queue(name: string): Queue {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis() });
    cache.set(name, q);
  }
  return q;
}

import { db } from "./db";

/** Creates a SyncJob row (unless one is already queued/running) and enqueues it. */
export async function startSync(accountId: string) {
  const existing = await db.syncJob.findFirst({ where: { accountId, status: { in: ["queued", "running"] } } });
  if (existing) return existing;
  const row = await db.syncJob.create({ data: { accountId } });
  await queue(QUEUES.sync).add(
    "sync-account",
    { accountId, syncJobId: row.id },
    { jobId: `sync-${row.id}`, attempts: 5, backoff: { type: "exponential", delay: 15000 }, removeOnComplete: 100, removeOnFail: 200 },
  );
  return row;
}
