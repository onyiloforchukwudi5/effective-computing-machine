import IORedis from "ioredis";

const g = globalThis as unknown as { redis?: IORedis };

export function redis(): IORedis {
  if (!g.redis) {
    g.redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return g.redis;
}

/** Fixed-window rate limiter. Returns true if allowed. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const r = redis();
  const k = `rl:${key}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSec);
  return n <= limit;
}
