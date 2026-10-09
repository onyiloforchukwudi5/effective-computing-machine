import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { checkOwnership, responderFields } from "@/lib/responders";

export const GET = authed(async (_req, user) => json(await db.autoResponder.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })));

export const POST = authed(async (req, user) => {
  const d = await body(req, responderFields);
  await checkOwnership(user.id, d.accountId, d.sendViaType, d.sendViaId);
  // always created OFF and in approve mode
  const r = await db.autoResponder.create({ data: { ...d, userId: user.id, enabled: false, mode: "approve" } });
  return json(r, 201);
});
