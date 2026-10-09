import { z } from "zod";
import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { queue, QUEUES } from "@/lib/queues";
import { redis } from "@/lib/redis";
import { contactWhere } from "@/lib/contacts";

export const GET = authed(async () => {
  const raw = await redis().get("vfy:port25");
  if (!raw) {
    await queue(QUEUES.verify).add("port25", { port25: true }, { removeOnComplete: true });
    return json({ checked: false });
  }
  return json({ checked: true, ...JSON.parse(raw) });
});

const schema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional(), filter: z.string().optional() });

export const POST = authed(async (req, user) => {
  const d = await body(req, schema);
  const where = d.all ? contactWhere(user.id, new URLSearchParams(d.filter ?? "")) : { userId: user.id, id: { in: d.ids ?? [] } };
  const contacts = await db.contact.findMany({ where, select: { id: true }, take: 20000 });
  await queue(QUEUES.verify).addBulk(contacts.map((c) => ({ name: "verify", data: { contactId: c.id }, opts: { attempts: 2, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: true } })));
  return json({ queued: contacts.length });
});
