import { db } from "@/lib/db";
import { authed, json } from "@/lib/api";
import { hintFor, providerOf } from "@/lib/deliverability";

/** Options for every 'Send via' dropdown (composer, sequences, auto-responders). */
export const GET = authed(async (_req, user) => {
  const [accounts, senders] = await Promise.all([
    db.mailAccount.findMany({ where: { userId: user.id, status: { not: "disconnected" } }, orderBy: { createdAt: "asc" } }),
    db.smtpSender.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return json([
    ...accounts.map((a) => ({
      type: "ACCOUNT", id: a.id, label: `${a.label} (${a.email})`, fromEmail: a.email, external: false,
      accountId: a.id, linkedSenderId: a.defaultSmtpSenderId, isDefault: false, host: a.smtpHost ?? "", provider: null, hint: null,
    })),
    ...senders.map((s) => ({
      type: "SMTP", id: s.id, label: `${s.label} <${s.fromEmail}>`, fromEmail: s.fromEmail, external: true,
      accountId: null, linkedSenderId: null, isDefault: s.isDefault, host: s.host, provider: providerOf(s.host), hint: hintFor(s.fromEmail, s.host),
    })),
  ]);
});
