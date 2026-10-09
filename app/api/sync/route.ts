import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { startSync } from "@/lib/queues";

/** True state comes from the DB, so it is correct after the browser was closed. */
export const GET = authed(async (_req, user) => {
  const accounts = await db.mailAccount.findMany({
    where: { userId: user.id },
    include: { folders: { orderBy: { path: "asc" } }, syncJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return json(accounts.map((a) => ({
    accountId: a.id, label: a.label, email: a.email, status: a.status, lastSyncAt: a.lastSyncAt, lastError: a.lastError,
    job: a.syncJobs[0] ?? null,
    folders: a.folders.map((f) => ({ id: f.id, path: f.path, total: f.totalMessages, fetched: f.fetched, done: f.done })),
  })));
});

export const POST = authed(async (req, user) => {
  const d = await body(req, z.object({ accountId: z.string().optional() }));
  const accs = await db.mailAccount.findMany({
    where: { userId: user.id, status: { not: "disconnected" }, ...(d.accountId ? { id: d.accountId } : {}) }, select: { id: true },
  });
  if (d.accountId && !accs.length) throw new HttpError("Account not found", 404);
  for (const a of accs) await startSync(a.id); // one job per account; worker runs them in parallel up to SYNC_CONCURRENCY
  return json({ queued: accs.length });
});
