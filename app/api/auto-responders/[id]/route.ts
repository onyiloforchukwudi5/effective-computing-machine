import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { checkOwnership, responderFields } from "@/lib/responders";

const patch = responderFields.partial().extend({
  enabled: z.boolean().optional(), paused: z.boolean().optional(),
  mode: z.enum(["approve", "auto"]).optional(), confirmAuto: z.boolean().optional(),
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const cur = await db.autoResponder.findFirst({ where: { id, userId: user.id } });
  if (!cur) throw new HttpError("Not found", 404);
  const { confirmAuto, ...d } = await body(req, patch);
  await checkOwnership(user.id, d.accountId ?? cur.accountId, d.sendViaType ?? cur.sendViaType, d.sendViaId ?? cur.sendViaId);
  if (d.mode === "auto" && cur.mode !== "auto") {
    if (!confirmAuto) throw new HttpError("Confirm the risks of automatic replies first");
    if (!cur.dryRunOkAt || Date.now() - cur.dryRunOkAt.getTime() > 24 * 3600_000) throw new HttpError("Run a successful dry run (within the last 24h) before switching to auto mode");
  }
  // any change to instructions/knowledge/mode invalidates the dry run
  const invalidates = d.instructions !== undefined || d.knowledgeText !== undefined || d.escalationKeywords !== undefined;
  const r = await db.autoResponder.update({ where: { id }, data: { ...d, ...(invalidates && d.mode !== "auto" ? { dryRunOkAt: null } : {}) } });
  return json(r);
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const r = await db.autoResponder.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new HttpError("Not found", 404);
  return json({ ok: true });
});
