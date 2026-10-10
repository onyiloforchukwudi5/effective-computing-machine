import { db } from "../lib/db";

const DAY = 24 * 3600_000;

function ttlDays(): number {
  const n = Number(process.env.SITE_UNVERIFIED_TTL_DAYS);
  return Number.isFinite(n) && n >= 1 ? n : 7;
}

/** Removes stale unconfirmed accounts and spent/expired auth tokens. Logs counts only. */
export async function cleanupUnverified(): Promise<void> {
  try {
    // Until the backfill has run every legacy user has emailVerifiedAt NULL: never delete before then.
    if (!(await db.appMeta.findUnique({ where: { key: "backfill_email_verified_v1" } }))) {
      console.log("cleanup skipped: backfill not done yet");
      return;
    }
    const cutoff = new Date(Date.now() - ttlDays() * DAY);
    let users = 0;
    for (;;) {
      const batch = await db.user.findMany({
        where: { emailVerifiedAt: null, googleSub: null, createdAt: { lt: cutoff } },
        select: { id: true },
        take: 200,
      });
      if (!batch.length) break;
      users += (await db.user.deleteMany({ where: { id: { in: batch.map((u) => u.id) } } })).count; // relations cascade
    }
    const old = new Date(Date.now() - 7 * DAY);
    const tokens = (await db.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: old } }, { usedAt: { lt: old } }] } })).count;
    console.log(`cleanup: removed ${users} unconfirmed accounts, ${tokens} tokens`);
  } catch {
    console.warn("cleanup skipped: database not ready (schema not pushed yet?)");
  }
}
