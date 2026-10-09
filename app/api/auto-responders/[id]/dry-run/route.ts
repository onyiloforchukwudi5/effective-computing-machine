import { db } from "@/lib/db";
import { aiErrorResponse, authed, HttpError, json } from "@/lib/api";
import { runResponder } from "@/lib/autoresponder";

/** Shows what the responder WOULD do on the last 20 incoming Inbox messages. Sends nothing, writes no logs. */
export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const r = await db.autoResponder.findFirst({ where: { id, userId: user.id } });
  if (!r) throw new HttpError("Not found", 404);
  const msgs = await db.message.findMany({ where: { accountId: r.accountId, folder: { specialUse: "\\Inbox" } }, orderBy: { receivedAt: "desc" }, take: 20 });
  // evaluate as if enabled so guards other than on/off are exercised
  const probe = { ...r, enabled: true, paused: false };
  try {
    const results = [];
    for (const m of msgs) {
      const d = await runResponder(probe, m, { dryRun: true });
      results.push({ messageId: m.id, subject: m.subject, from: m.fromEmail, decision: d.decision, reason: d.reason, reply: d.body ?? null });
    }
    const errored = results.filter((x) => x.reason === "Error while processing").length;
    if (errored === 0) await db.autoResponder.update({ where: { id }, data: { dryRunOkAt: new Date() } });
    return json({ results, ok: errored === 0 });
  } catch (e) {
    const x = aiErrorResponse(e);
    if (x) return x;
    throw e;
  }
});
