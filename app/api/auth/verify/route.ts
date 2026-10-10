import { z } from "zod";
import { checkEmailCode, createSession, markEmailVerified } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { rateLimit } from "@/lib/redis";

const schema = z.object({ email: z.string().email().toLowerCase(), code: z.string().regex(/^\d{6}$/) });
const BAD = "That code is incorrect or has expired";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`verify:ip:${ip}`, 30, 900))) return fail("Too many attempts", 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(BAD);
  const { email, code } = parsed.data;
  if (!(await rateLimit(`verify:email:${email}`, 10, 900))) return fail("Too many attempts", 429);
  const userId = await checkEmailCode(email, code);
  if (!userId) return fail(BAD);
  await markEmailVerified(userId);
  await createSession(userId);
  return json({ ok: true });
}
