import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { contactWhere } from "@/lib/contacts";
import { nextWindowStart, stepDelayMs } from "@/lib/sequences";

const schema = z.object({
  contactIds: z.array(z.string()).optional(),
  filter: z.string().optional(), // saved filter = contacts query string
  includeRisky: z.boolean().optional(),
  includeUnknown: z.boolean().optional(),
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const seq = await db.sequence.findFirst({ where: { id, userId: user.id }, include: { steps: { orderBy: { position: "asc" } } } });
  if (!seq) throw new HttpError("Not found", 404);
  const d = await body(req, schema);
  const where = d.contactIds ? { userId: user.id, id: { in: d.contactIds } } : contactWhere(user.id, new URLSearchParams(d.filter ?? ""));
  const contacts = await db.contact.findMany({ where, take: 20000 });
  const [unsubs, existing] = await Promise.all([
    db.unsubscribe.findMany({ where: { userId: user.id, email: { in: contacts.map((c) => c.email) } } }),
    db.sequenceEnrollment.findMany({ where: { sequenceId: id, contactId: { in: contacts.map((c) => c.id) } }, select: { contactId: true } }),
  ]);
  const unsub = new Set(unsubs.map((u) => u.email));
  const already = new Set(existing.map((e) => e.contactId));
  const skipped = { invalid: 0, unsubscribed: 0, alreadyEnrolled: 0, risky: 0, unknown: 0 };
  const ok = [];
  const warn = { risky: 0, unknown: 0 };
  for (const c of contacts) {
    if (unsub.has(c.email)) { skipped.unsubscribed++; continue; }
    if (already.has(c.id)) { skipped.alreadyEnrolled++; continue; }
    if (seq.skipUnverified) {
      if (c.verificationStatus === "invalid") { skipped.invalid++; continue; }
      if (c.verificationStatus === "risky") { warn.risky++; if (!d.includeRisky) { skipped.risky++; continue; } }
      if (c.verificationStatus === null || c.verificationStatus === "unknown") { warn.unknown++; if (!d.includeUnknown) { skipped.unknown++; continue; } }
    }
    ok.push(c);
  }
  if ((warn.risky || warn.unknown) && d.includeRisky === undefined && d.includeUnknown === undefined) {
    return json({ needsConfirmation: true, warn, skipped, eligible: ok.length }); // UI asks include/exclude, then re-posts
  }
  const first = seq.steps[0];
  const next = first ? nextWindowStart(new Date(Date.now() + stepDelayMs(first)), seq) : null;
  await db.sequenceEnrollment.createMany({ data: ok.map((c) => ({ sequenceId: id, contactId: c.id, nextSendAt: next })), skipDuplicates: true });
  return json({ enrolled: ok.length, skipped });
});
