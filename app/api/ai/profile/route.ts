import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";

const schema = z.object({
  businessName: z.string().max(200), whatYouDo: z.string().max(2000), tone: z.string().max(100),
  signature: z.string().max(1000), language: z.string().max(50), doNotSay: z.string().max(1000),
});

export const GET = authed(async (_req, user) => json((await db.aiProfile.findUnique({ where: { userId: user.id } })) ?? {}));
export const PUT = authed(async (req, user) => {
  const d = await body(req, schema);
  await db.aiProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...d }, update: d });
  return json({ ok: true });
});
