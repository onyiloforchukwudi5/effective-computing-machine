import { randomBytes } from "crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Transporter } from "nodemailer";
import { db } from "../db";
import { assertSafeTarget, errText } from "../net-guard";
import { withDeliverabilityHint } from "../deliverability";
import { imapFor, smtpFor, smtpSenderTransport } from "./transport";

export type SendVia = { type: "ACCOUNT" | "SMTP"; id: string };

export type SendInput = {
  userId: string;
  via: SendVia;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string;
  headers?: Record<string, string>;
  /** Append a copy to this account's Sent folder (always done for mailbox-own SMTP). */
  saveCopyAccountId?: string | null;
  /** Skip the Unsubscribe-list check (never for marketing sends). */
  skipSuppression?: boolean;
  log?: boolean;
};

export class SendError extends Error {
  constructor(message: string, public permanent: boolean, public code?: number) {
    super(message);
  }
}

export const norm = (e: string) => e.trim().toLowerCase();

export async function resolveSender(userId: string, via: SendVia) {
  if (via.type === "SMTP") {
    const s = await db.smtpSender.findFirst({ where: { id: via.id, userId } }); // ownership check
    if (!s) throw new SendError("Sender not found", true);
    return {
      transport: smtpSenderTransport(s) as Transporter, host: s.host, port: s.port,
      from: { name: s.fromName, address: s.fromEmail }, replyTo: s.replyTo ?? undefined, accountId: null as string | null,
      dailyLimit: s.dailyLimit, external: true,
    };
  }
  const a = await db.mailAccount.findFirst({ where: { id: via.id, userId } });
  if (!a) throw new SendError("Mail account not found", true);
  if (a.status === "disconnected") throw new SendError("Mail account is disconnected", true);
  return {
    transport: await smtpFor(a), host: a.smtpHost ?? "", port: a.smtpPort ?? 465,
    from: { name: a.label, address: a.email }, replyTo: undefined, accountId: a.id as string | null, dailyLimit: 500, external: false,
  };
}

export async function suppressedAddresses(userId: string, emails: string[]): Promise<string[]> {
  const rows = await db.unsubscribe.findMany({ where: { userId, email: { in: emails.map(norm) } } });
  return rows.map((r) => r.email);
}

export async function appendToSent(accountId: string, raw: Buffer) {
  const a = await db.mailAccount.findUniqueOrThrow({ where: { id: accountId } });
  const folders = await db.folder.findMany({ where: { accountId } });
  const sent = folders.find((f) => f.specialUse === "\\Sent") ?? folders.find((f) => /sent/i.test(f.path));
  if (!sent) return;
  const c = await imapFor(a);
  c.on("error", () => {});
  await c.connect();
  try {
    await c.append(sent.path, raw, ["\\Seen"]);
  } finally {
    await c.logout().catch(() => {});
  }
}

export async function sendMail(input: SendInput): Promise<{ messageId: string; response: string }> {
  const sender = await resolveSender(input.userId, input.via);
  const all = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])];
  if (!input.skipSuppression) {
    const blocked = await suppressedAddresses(input.userId, all);
    if (blocked.length) throw new SendError(`Recipient(s) unsubscribed: ${blocked.join(", ")}`, true);
  }
  const domain = sender.from.address.split("@")[1];
  const messageId = input.messageId ?? `<${randomBytes(12).toString("hex")}@${domain}>`;
  const mail = {
    from: sender.from, to: input.to, cc: input.cc, bcc: input.bcc, replyTo: sender.replyTo,
    subject: input.subject, html: input.html, text: input.text, messageId,
    inReplyTo: input.inReplyTo, references: input.references, headers: input.headers,
  };
  const log = (status: string, error?: string) =>
    input.log === false
      ? Promise.resolve()
      : db.sentLog.create({
          data: { userId: input.userId, senderId: input.via.id, senderType: input.via.type, to: input.to.join(", "), subject: input.subject, status, error: error ?? null },
        });
  try {
    if (sender.host) await assertSafeTarget(sender.host, sender.port, "smtp");
    const info = await sender.transport.sendMail(mail);
    await log("sent");
    const copyTo = sender.external ? input.saveCopyAccountId : sender.accountId;
    if (copyTo) {
      const raw = await new MailComposer(mail).compile().build();
      await appendToSent(copyTo, raw).catch((e) => console.error("append to Sent failed:", errText(e)));
    }
    return { messageId, response: info.response };
  } catch (e) {
    if (e instanceof SendError) throw e;
    const x = e as { responseCode?: number };
    const msg = withDeliverabilityHint(errText(e));
    await log("failed", msg);
    const code = x.responseCode;
    throw new SendError(msg, typeof code === "number" && code >= 500, code);
  }
}
