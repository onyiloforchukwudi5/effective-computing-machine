import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";

const schema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`login:${ip}`, 20, 900))) return fail("Too many attempts", 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid credentials", 401);
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) return fail("Invalid credentials", 401);
  await createSession(user.id);
  return json({ ok: true });
}
