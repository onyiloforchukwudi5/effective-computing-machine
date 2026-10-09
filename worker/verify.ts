import type { Job } from "bullmq";
import { db } from "../lib/db";
import { queue, QUEUES } from "../lib/queues";
import { redis } from "../lib/redis";
import { testPort25, verifyAddress } from "../lib/verify";

export async function processVerify(job: Job<{ contactId?: string; retry?: number; port25?: boolean }>) {
  if (job.data.port25) return refreshPort25();
  const c = await db.contact.findUnique({ where: { id: job.data.contactId } });
  if (!c) return;
  const r = await verifyAddress(c.email);
  await db.verificationResult.create({
    data: { contactId: c.id, email: c.email, status: r.status, reason: r.reason, smtpCode: r.smtpCode ?? null, smtpMessage: r.smtpMessage ?? null },
  });
  await db.contact.update({ where: { id: c.id }, data: { verificationStatus: r.status } });
  const retry = job.data.retry ?? 0;
  if (r.retryLater && retry < 2) {
    await queue(QUEUES.verify).add("verify", { contactId: c.id, retry: retry + 1 }, { delay: 5 * 60_000, removeOnComplete: true });
  }
}

export async function refreshPort25() {
  const r = await testPort25();
  await redis().set("vfy:port25", JSON.stringify({ ...r, checkedAt: new Date().toISOString() }), "EX", 7 * 3600);
  return r;
}
