import { contactWhere } from "@/lib/contacts";
import { db } from "@/lib/db";
import { authed, json } from "@/lib/api";

export const GET = authed(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const sort = ["email", "name", "messageCount", "lastSeen", "verificationStatus"].includes(sp.get("sort") ?? "") ? sp.get("sort")! : "lastSeen";
  const dir = sp.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const size = 50;
  const where = contactWhere(user.id, sp);
  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * size, take: size, include: { sources: { include: { account: { select: { label: true } } } } } }),
  ]);
  return json({
    total, page, size,
    rows: rows.map((c) => ({
      id: c.id, email: c.email, name: c.name, messageCount: c.messageCount, lastSeen: c.lastSeen,
      verificationStatus: c.verificationStatus, accounts: Array.from(new Set(c.sources.map((s) => s.account.label))),
    })),
  });
});
