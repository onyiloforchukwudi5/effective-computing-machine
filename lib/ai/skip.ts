import type { Message } from "@prisma/client";
import { db } from "../db";

const NOREPLY = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)(@|[._+-])/i;
const OOO = /out of office|automatic reply|auto-?reply|autoreply|away from (my )?(desk|office)|vacation reply/i;

/** Shared "does this message need a reply at all?" pre-filter (no AI involved). Returns a reason to skip, or null. */
export async function skipReason(m: Message, userId: string, maxAgeDays: number): Promise<string | null> {
  const from = (m.fromEmail ?? "").toLowerCase();
  if (!from) return "No sender address";
  if (NOREPLY.test(from)) return "No-reply / system sender";
  if (m.listId || m.listUnsubscribe || /bulk|junk|list/i.test(m.precedence ?? "")) return "Mailing list / bulk mail";
  if (/mailer-daemon|postmaster/i.test(from) || /multipart\/report|delivery-status/i.test(m.rawHeaders ?? "")) return "Bounce / DSN";
  if (m.autoSubmitted && m.autoSubmitted.trim().toLowerCase() !== "no") return "Auto-Submitted message";
  if (m.xAutoResponseSuppress) return "X-Auto-Response-Suppress set";
  if (OOO.test(m.subject ?? "")) return "Auto-reply / out-of-office";
  const own = await db.mailAccount.findMany({ where: { userId }, select: { email: true } });
  if (own.some((a) => a.email.toLowerCase() === from)) return "Sent from the account's own address";
  if (Date.now() - m.receivedAt.getTime() > maxAgeDays * 86_400_000) return `Older than ${maxAgeDays} days`;
  return null;
}
