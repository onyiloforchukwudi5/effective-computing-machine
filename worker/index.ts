import { Worker } from "bullmq";
import { redis } from "../lib/redis";
import { queue, QUEUES, startSync } from "../lib/queues";
import { db } from "../lib/db";
import { onNewInboxMessage } from "../lib/events";
import { processSync } from "./sync";
import { processVerify, refreshPort25 } from "./verify";
import { processSend, schedulerTick, sequenceInboundHandler } from "./sequences";
import { aiInboundHandler, processAi } from "./ai";

const conn = redis();
const log = (...a: unknown[]) => console.log("[worker]", ...a);

// Subscribers to "new incoming Inbox message stored" (never fired on historical backfill)
onNewInboxMessage(sequenceInboundHandler);
onNewInboxMessage(aiInboundHandler);

const SYNC_CONCURRENCY = Number(process.env.SYNC_CONCURRENCY ?? 3);
const workers = [
  new Worker(QUEUES.sync, async (job) => {
    if (job.name === "sync-all") {
      const accs = await db.mailAccount.findMany({ where: { status: { in: ["connected", "error", "syncing"] } }, select: { id: true } });
      for (const a of accs) await startSync(a.id);
      return;
    }
    await processSync(job);
  }, { connection: conn, concurrency: SYNC_CONCURRENCY }),
  new Worker(QUEUES.verify, processVerify, { connection: conn, concurrency: 5 }),
  new Worker(QUEUES.sequences, async (job) => (job.name === "tick" ? schedulerTick() : processSend(job)), { connection: conn, concurrency: 2 }),
  new Worker(QUEUES.ai, processAi, { connection: conn, concurrency: 3 }),
];
for (const w of workers) w.on("failed", (j, e) => log(`job ${j?.name} failed:`, e.message.slice(0, 200)));

async function boot() {
  // jobs left "running" by a crashed process get re-queued so they resume from stored per-folder progress
  const stuck = await db.syncJob.findMany({ where: { status: "running" } });
  for (const s of stuck) {
    await db.syncJob.update({ where: { id: s.id }, data: { status: "error", error: "Worker restarted", finishedAt: new Date() } });
    await startSync(s.accountId);
  }
  const mins = Number(process.env.SYNC_INTERVAL_MINUTES ?? 10);
  await queue(QUEUES.sync).upsertJobScheduler("sync-all-scheduler", { every: mins * 60_000 }, { name: "sync-all" });
  await queue(QUEUES.sequences).upsertJobScheduler("sequence-tick", { every: 60_000 }, { name: "tick" });
  refreshPort25().catch(() => {});
  setInterval(() => refreshPort25().catch(() => {}), 6 * 3600_000);
  log("started");
}
boot().catch((e) => { console.error(e); process.exit(1); });

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  });
}
