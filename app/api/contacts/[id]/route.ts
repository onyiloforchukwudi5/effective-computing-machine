import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const c = await db.contact.findFirst({ where: { id, userId: user.id }, include: { verifications: { orderBy: { checkedAt: "desc" }, take: 1 } } });
  if (!c) throw new HttpError("Not found", 404);
  const messages = await db.message.findMany({
    where: { account: { userId: user.id }, OR: [{ fromEmail: c.email }, { toAddrs: { array_contains: [{ address: c.email }] } }, { ccAddrs: { array_contains: [{ address: c.email }] } }] },
    orderBy: { receivedAt: "desc" }, take: 100,
    select: { id: true, subject: true, fromEmail: true, receivedAt: true, accountId: true, folder: { select: { path: true } } },
  });
  return json({ contact: { id: c.id, email: c.email, name: c.name, messageCount: c.messageCount, firstSeen: c.firstSeen, lastSeen: c.lastSeen, verificationStatus: c.verificationStatus, verification: c.verifications[0] ?? null }, messages });
});
