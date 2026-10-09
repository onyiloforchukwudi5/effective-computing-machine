import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, fail, HttpError, json } from "@/lib/api";
import { SendError, sendMail } from "@/lib/mail/send";
import { renderMerge, renderStepHtml, unsubscribeUrl } from "@/lib/sequences";
import { rateLimit } from "@/lib/redis";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const seq = await db.sequence.findFirst({ where: { id, userId: user.id } });
  if (!seq || !seq.sendViaType || !seq.sendViaId) throw new HttpError("Choose a sender first");
  if (!(await rateLimit(`seqtest:${user.id}`, 10, 600))) return fail("Too many test sends", 429);
  const d = await body(req, z.object({ subject: z.string(), bodyHtml: z.string(), contactId: z.string().optional() }));
  const c = (d.contactId && (await db.contact.findFirst({ where: { id: d.contactId, userId: user.id } }))) || { name: "Test Contact", email: user.email, company: "Example Co", id: "", userId: user.id } as never;
  try {
    const url = unsubscribeUrl(user.id, user.email);
    await sendMail({
      userId: user.id, via: { type: seq.sendViaType as "ACCOUNT" | "SMTP", id: seq.sendViaId }, to: [user.email],
      subject: `[Test] ${renderMerge(d.subject, c)}`, html: renderStepHtml(d.bodyHtml, seq, c, user.id),
      headers: { "List-Unsubscribe": `<${url}>` }, skipSuppression: true,
    });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof SendError) return json({ ok: false, error: e.message }, 502);
    throw e;
  }
});
