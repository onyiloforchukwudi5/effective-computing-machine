import { db } from "@/lib/db";
import { authed } from "@/lib/api";
import { contactWhere } from "@/lib/contacts";

const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV formula injection guard
  return `"${s.replace(/"/g, '""')}"`;
};

export const GET = authed(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const ids = sp.get("ids")?.split(",").filter(Boolean);
  const where = { ...contactWhere(user.id, sp), ...(ids?.length ? { id: { in: ids } } : {}) };
  const rows = await db.contact.findMany({ where, orderBy: { lastSeen: "desc" }, include: { sources: { include: { account: { select: { label: true } } } } } });
  const csv = ["name,email,source_accounts,message_count,last_contacted,verification_status",
    ...rows.map((c) => [c.name, c.email, Array.from(new Set(c.sources.map((s) => s.account.label))).join("; "), c.messageCount, c.lastSeen.toISOString(), c.verificationStatus ?? "unverified"].map(cell).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="contacts.csv"' } });
});
