import type { AutoResponder, Message } from "@prisma/client";
import { db } from "./db";
import { containsForbidden, generateText, parseJsonLoose, profilePrompt, SAFETY_RULES, untrusted, AiLimitError } from "./ai";
import { skipReason } from "./ai/skip";
import { threadContext, trim } from "./ai/tasks";
import { sendMail, SendError } from "./mail/send";
import { z } from "zod";

export type Decision = { decision: "replied" | "drafted" | "skipped" | "escalated"; reason: string; subject?: string; body?: string };

const HARD_DAILY_CAP = Number(process.env.AUTOREPLY_HARD_DAILY_CAP ?? 100);
const csv = (s: string) => s.split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

function localHour(d: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
}

const classSchema = z.object({ needsReply: z.boolean(), confidence: z.number().min(0).max(1), escalate: z.boolean().optional(), reason: z.string().optional() });

async function guards(r: AutoResponder, m: Message, userId: string): Promise<Decision | null> {
  const skip = (reason: string): Decision => ({ decision: "skipped", reason });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.autoRepliesPaused) return skip("All auto-replies are paused");
  if (!r.enabled || r.paused) return skip("Responder is off or paused");
  const s = await skipReason(m, userId, r.maxAgeDays);
  if (s) return skip(s);
  const from = m.fromEmail!.toLowerCase();
  if (await db.unsubscribe.findUnique({ where: { userId_email: { userId, email: from } } })) return skip("Address is on the Unsubscribe list");
  if (r.onlyKnownContacts) {
    const c = await db.contact.findUnique({ where: { userId_email: { userId, email: from } } });
    if (!c || c.firstSeen >= m.receivedAt) return skip("Sender is not a known contact");
  }
  if (r.toAddressFilter) {
    const recips = [...((m.toAddrs as { address: string }[] | null) ?? []), ...((m.ccAddrs as { address: string }[] | null) ?? [])].map((a) => a.address);
    if (!recips.includes(r.toAddressFilter.toLowerCase())) return skip("Not addressed to the filtered address");
  }
  const hay = `${m.subject ?? ""}\n${m.textBody ?? ""}`.toLowerCase();
  const inc = csv(r.keywordsInclude), exc = csv(r.keywordsExclude);
  if (inc.length && !inc.some((k) => hay.includes(k))) return skip("No include keyword matched");
  const hit = exc.find((k) => hay.includes(k));
  if (hit) return skip(`Exclude keyword matched: ${hit}`);
  const h = localHour(new Date(), r.timezone);
  if (h < r.activeStartHour || h >= r.activeEndHour) return skip("Outside active hours");
  const day = new Date(Date.now() - 86_400_000);
  const replied = { decision: "replied", createdAt: { gte: day } };
  if ((await db.autoReplyLog.count({ where: { responderId: r.id, ...replied } })) >= r.maxRepliesPerDay) return skip("Responder daily cap reached");
  if ((await db.autoReplyLog.count({ where: { responder: { userId }, ...replied } })) >= HARD_DAILY_CAP) return skip("Hard daily cap reached");
  if ((await db.autoReplyLog.count({ where: { responderId: r.id, contactEmail: from, ...replied } })) >= r.maxRepliesPerContactPerDay) return skip("Per-contact daily cap reached");
  if (await db.autoReplyLog.findFirst({ where: { responderId: r.id, contactEmail: from, decision: "replied", createdAt: { gte: new Date(Date.now() - r.cooldownHours * 3600_000) } } })) return skip("Cooldown: already replied recently");
  const loopN = await db.autoReplyLog.count({ where: { responderId: r.id, contactEmail: from, decision: "replied", createdAt: { gte: new Date(Date.now() - r.loopWindowHours * 3600_000) } } });
  if (loopN >= r.loopMaxReplies) return skip("Loop protection: too many auto-replies to this address");
  return null;
}

async function classify(r: AutoResponder, m: Message, userId: string, thread: string) {
  const out = await generateText(userId, "autoreply-classify", {
    system: `You classify incoming email for an auto-responder. ${SAFETY_RULES}
Respond ONLY with JSON: {"needsReply": boolean, "confidence": 0-1, "escalate": boolean, "reason": string}.
Set escalate=true if the message is angry, legal, a refund/cancel request, price negotiation, contains an attachment the sender expects us to act on, or otherwise needs a human. Extra escalation keywords: ${r.escalationKeywords}.`,
    messages: [{ role: "user", content: `Subject: ${m.subject}\nFrom: ${m.fromEmail}\nAttachments: ${JSON.stringify(m.attachments ?? [])}\n\n${untrusted("THREAD", thread)}` }],
    maxTokens: 160, temperature: 0,
  });
  try {
    return classSchema.parse(parseJsonLoose(out));
  } catch {
    return { needsReply: true, confidence: 0, escalate: true, reason: "Classifier output unusable" };
  }
}

async function generateReply(r: AutoResponder, m: Message, userId: string, thread: string) {
  const profile = await profilePrompt(userId);
  const out = await generateText(userId, "autoreply", {
    system: `You write email replies on behalf of a business. ${SAFETY_RULES}
Answer ONLY using the KNOWLEDGE below. If the answer is not there, say a human will follow up; never invent facts, prices, dates or commitments. Never include secrets or other people's data.
BUSINESS PROFILE:\n${profile.text}\n\nINSTRUCTIONS:\n${r.instructions || "Reply helpfully and briefly."}\n\nKNOWLEDGE:\n${r.knowledgeText || "(none provided)"}\n\nReturn only the reply body as plain text.`,
    messages: [{ role: "user", content: `Reply to the latest message.\n${untrusted("THREAD", thread)}` }],
    maxTokens: 700,
  });
  return { body: out.trim(), doNotSay: profile.doNotSay };
}

/**
 * Decide and (unless dryRun) act on one incoming message for one responder.
 * Idempotent: AutoReplyLog is unique on (responderId, messageId) and is claimed BEFORE any send.
 */
export async function runResponder(r: AutoResponder, m: Message, opts: { dryRun?: boolean } = {}): Promise<Decision> {
  const userId = r.userId;
  const from = (m.fromEmail ?? "").toLowerCase();
  let claimId: string | null = null;
  if (!opts.dryRun) {
    try {
      claimId = (await db.autoReplyLog.create({ data: { responderId: r.id, messageId: m.id, contactEmail: from, decision: "skipped", reason: "In progress" } })).id;
    } catch {
      return { decision: "skipped", reason: "Already processed" };
    }
  }
  const finish = async (d: Decision, extra: { aiDraftId?: string; sentMessageId?: string; error?: string } = {}) => {
    if (claimId) await db.autoReplyLog.update({ where: { id: claimId }, data: { decision: d.decision, reason: d.reason, ...extra } });
    return d;
  };
  try {
    const g = await guards(r, m, userId);
    if (g) return finish(g);
    const thread = await threadContext(m);
    const c = await classify(r, m, userId, thread);
    if (!c.needsReply) return finish({ decision: "skipped", reason: `AI: no reply needed${c.reason ? ` (${c.reason})` : ""}` });
    const hay = `${m.subject ?? ""}\n${trim(m.textBody, 4000)}`.toLowerCase();
    const kw = csv(r.escalationKeywords).find((k) => hay.includes(k));
    const escalateReason = kw ? `Escalation keyword: ${kw}` : c.escalate ? `AI flagged for a human${c.reason ? `: ${c.reason}` : ""}` : c.confidence < 0.6 ? `Low confidence (${c.confidence})` : null;
    const subject = `Re: ${(m.subject ?? "").replace(/^re:\s*/i, "")}`;
    const reply = await generateReply(r, m, userId, thread);
    const forbidden = containsForbidden(reply.body, reply.doNotSay);
    const reason = escalateReason ?? (forbidden ? `Draft contains forbidden phrase "${forbidden}"` : null);
    const saveDraft = async (kind: string, note: string) => {
      if (opts.dryRun) return undefined;
      const d = await db.aiDraft.upsert({
        where: { messageId: m.id },
        create: { userId, messageId: m.id, accountId: m.accountId, subject, body: reply.body, kind, note },
        update: { subject, body: reply.body, kind, note, status: "pending" },
      });
      return d.id;
    };
    if (reason) return finish({ decision: "escalated", reason, subject, body: reply.body }, { aiDraftId: await saveDraft("escalated", reason) });
    if (r.mode !== "auto") return finish({ decision: "drafted", reason: "Approve mode: draft awaiting approval", subject, body: reply.body }, { aiDraftId: await saveDraft("draft", "Auto-responder draft") });
    if (opts.dryRun) return { decision: "replied", reason: "Would send automatically", subject, body: reply.body };
    // kill switch re-check right before sending
    const [fresh, user] = await Promise.all([db.autoResponder.findUniqueOrThrow({ where: { id: r.id } }), db.user.findUniqueOrThrow({ where: { id: userId } })]);
    if (!fresh.enabled || fresh.paused || user.autoRepliesPaused || fresh.mode !== "auto") return finish({ decision: "skipped", reason: "Paused before sending" });
    const via = r.sendViaType === "SMTP" && r.sendViaId ? { type: "SMTP" as const, id: r.sendViaId } : { type: "ACCOUNT" as const, id: r.accountId };
    const refs = [m.references, m.messageIdHeader].filter(Boolean).join(" ") || undefined;
    const html = reply.body.split("\n").map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    try {
      const sent = await sendMail({
        userId, via, to: [from], subject, html, text: reply.body, inReplyTo: m.messageIdHeader ?? undefined, references: refs,
        headers: { "Auto-Submitted": "auto-replied" }, saveCopyAccountId: r.saveCopyToSent ? r.accountId : null,
      });
      return finish({ decision: "replied", reason: "Sent automatically", subject, body: reply.body }, { sentMessageId: sent.messageId });
    } catch (e) {
      const msg = e instanceof SendError ? e.message : "Send failed";
      return finish({ decision: "skipped", reason: "Send failed" }, { error: msg });
    }
  } catch (e) {
    if (e instanceof AiLimitError) return finish({ decision: "skipped", reason: "AI daily limit reached" });
    const msg = e instanceof Error ? e.message : "error";
    await finish({ decision: "skipped", reason: "Error while processing" }, { error: msg.slice(0, 300) });
    return { decision: "skipped", reason: "Error while processing" };
  }
}
