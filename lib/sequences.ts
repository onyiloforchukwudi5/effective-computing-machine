import type { Contact, Sequence } from "@prisma/client";
import { db } from "./db";
import { signToken } from "./crypto";
import { sanitizeEmailHtml } from "./sanitize";

export const MERGE_FIELDS = ["firstName", "lastName", "email", "company"] as const;

export function contactFields(c: Pick<Contact, "name" | "email" | "company">): Record<string, string> {
  const parts = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), email: c.email, company: c.company ?? "" };
}

/** {{firstName}} or {{firstName|there}} (fallback when empty). Unknown fields render as their fallback or empty. */
export function renderMerge(tpl: string, c: Pick<Contact, "name" | "email" | "company">): string {
  const f = contactFields(c);
  return tpl.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, fb?: string) => f[k] || (fb ?? "").trim());
}

export function unsubscribeUrl(userId: string, email: string) {
  return `${process.env.APP_URL ?? ""}/u/${signToken({ u: userId, e: email.toLowerCase() })}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Mandatory footer, appended by the engine (never by the AI or the author). */
export function footerHtml(seq: Pick<Sequence, "footerText" | "postalAddress">, url: string) {
  return `<hr><p style="font-size:12px;color:#666">${esc(seq.footerText)}<br>${esc(seq.postalAddress)}<br><a href="${url}">Unsubscribe</a></p>`;
}

export function renderStepHtml(bodyHtml: string, seq: Pick<Sequence, "footerText" | "postalAddress">, contact: Contact, userId: string) {
  return sanitizeEmailHtml(renderMerge(bodyHtml, contact)) + footerHtml(seq, unsubscribeUrl(userId, contact.email));
}

function localParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = f.find((p) => p.type === "weekday")!.value;
  const hour = Number(f.find((p) => p.type === "hour")!.value);
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}

export function inWindow(d: Date, s: Pick<Sequence, "timezone" | "sendDays" | "startHour" | "endHour">) {
  const { day, hour } = localParts(d, s.timezone);
  return s.sendDays.includes(day) && hour >= s.startHour && hour < s.endHour;
}

/** First instant >= d that is inside the send window (15 min resolution). */
export function nextWindowStart(d: Date, s: Pick<Sequence, "timezone" | "sendDays" | "startHour" | "endHour">) {
  let t = new Date(d);
  for (let i = 0; i < 8 * 96 && !inWindow(t, s); i++) t = new Date(t.getTime() + 15 * 60_000);
  return t;
}

export function stepDelayMs(step: { delayDays: number; delayHours: number }) {
  return (step.delayDays * 24 + step.delayHours) * 3600_000;
}

/** Stop all active enrollments for an address under a user. */
export async function stopEnrollmentsForEmail(userId: string, email: string, status: string, reason: string) {
  await db.sequenceEnrollment.updateMany({
    where: { status: { in: ["active", "paused"] }, contact: { userId, email: email.toLowerCase() } },
    data: { status, stopReason: reason, finishedAt: new Date(), nextSendAt: null },
  });
}

export async function addUnsubscribe(userId: string, email: string, source: string) {
  const e = email.toLowerCase();
  await db.unsubscribe.upsert({ where: { userId_email: { userId, email: e } }, create: { userId, email: e, source }, update: {} });
  await stopEnrollmentsForEmail(userId, e, "unsubscribed", source);
}
