import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";

const schema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`signup:${ip}`, 10, 3600))) return fail("Too many attempts", 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Valid email and a password of 8+ characters are required");
  const { email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return fail("Email already registered", 409);
  const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password) } });
  await createSession(user.id);
  return json({ ok: true });
}
