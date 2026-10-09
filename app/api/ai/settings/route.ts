import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { checkCap } from "@/lib/ai";

const schema = z.object({
  provider: z.enum(["openai", "anthropic"]).optional(),
  model: z.string().max(100).optional(),
  apiKey: z.string().min(8).optional(),
  removeKey: z.boolean().optional(),
});

export const GET = authed(async (_req, user) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const cap = await checkCap(user.id);
  return json({
    provider: u.aiProvider, model: u.aiModel, keyMasked: u.aiKeyEnc ? "••••••••" : null,
    serverKey: !!process.env.AI_API_KEY, usage: cap,
  });
});

export const PUT = authed(async (req, user) => {
  const d = await body(req, schema);
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(d.provider ? { aiProvider: d.provider } : {}), ...(d.model !== undefined ? { aiModel: d.model || null } : {}),
      ...(d.apiKey ? { aiKeyEnc: encrypt(d.apiKey) } : {}), ...(d.removeKey ? { aiKeyEnc: null } : {}),
    },
  });
  return json({ ok: true });
});
