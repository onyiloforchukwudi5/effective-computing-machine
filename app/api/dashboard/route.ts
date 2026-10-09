import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { redis } from "@/lib/redis";

export const GET = authed(async (_req, user) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const [accounts, contacts, senders, sequences, escalated, activeResponders] = await Promise.all([
    db.mailAccount.count({ where: { userId: user.id } }), db.contact.count({ where: { userId: user.id } }),
    db.smtpSender.count({ where: { userId: user.id } }), db.sequence.count({ where: { userId: user.id } }),
    db.aiDraft.count({ where: { userId: user.id, kind: "escalated", status: "pending" } }),
    db.autoResponder.count({ where: { userId: user.id, enabled: true, paused: false } }),
  ]);
  return json({ accounts, contacts, senders, sequences, escalated, activeResponders, autoRepliesPaused: u.autoRepliesPaused, aiCapNotice: !!(await redis().get(`ai:capnotice:${user.id}`)) });
});

/** Global kill switch for all auto-replies. */
export const PUT = authed(async (req, user) => {
  const d = await body(req, z.object({ autoRepliesPaused: z.boolean() }));
  await db.user.update({ where: { id: user.id }, data: d });
  return json({ ok: true });
});
