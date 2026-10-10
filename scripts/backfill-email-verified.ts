import { db } from "../lib/db";

const KEY = "backfill_email_verified_v1";

async function main() {
  const grandfathered = await db.$transaction(async (tx) => {
    if (await tx.appMeta.findUnique({ where: { key: KEY } })) return null;
    const n = await tx.$executeRaw`UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL`;
    await tx.appMeta.create({ data: { key: KEY, value: String(n) } });
    return n;
  });
  if (grandfathered === null) console.log("backfill: already done");
  else console.log(`backfill: grandfathered ${grandfathered} users`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error("backfill failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
