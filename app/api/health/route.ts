import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { db: false, redis: false };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {}
  try {
    checks.redis = (await redis().ping()) === "PONG";
  } catch {}
  const ok = checks.db && checks.redis;
  return Response.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
