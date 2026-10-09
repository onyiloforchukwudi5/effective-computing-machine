import { z } from "zod";
import type { Message } from "@prisma/client";
import { db } from "../db";
import { generateText, parseJsonLoose, profilePrompt, SAFETY_RULES, untrusted } from "./index";

export const trim = (s: string | null | undefined, n = 1500) => (s ?? "").replace(/\s+\n/g, "\n").slice(0, n);

export async function threadContext(m: Message): Promise<string> {
  const ids = [m.messageIdHeader, m.inReplyTo, ...(m.references?.split(/\s+/) ?? [])].filter((x): x is string => !!x);
  const msgs = await db.message.findMany({
    where: { accountId: m.accountId, OR: [{ id: m.id }, { messageIdHeader: { in: ids } }, { inReplyTo: { in: ids } }] },
    orderBy: { receivedAt: "desc" }, take: 10,
  });
  return msgs.reverse().map((x) => `From: ${x.fromEmail}\nDate: ${x.receivedAt.toISOString()}\nSubject: ${x.subject}\n${trim(x.textBody, 1200)}`).join("\n---\n");
}

const draftSchema = z.object({ subject: z.string(), body: z.string() });

export async function draftWithAi(userId: string, feature: string, task: string, thread?: string, extraSystem = "") {
  const profile = await profilePrompt(userId);
  const system = `You write email drafts for a user.\n${SAFETY_RULES}\n\nBUSINESS PROFILE:\n${profile.text}\n${extraSystem}\n` +
    `Keep merge fields like {{firstName}} intact. Respond with ONLY a JSON object: {"subject": string, "body": string} where body is plain text with newlines.`;
  const content = `${task}${thread ? `\n\nEmail thread (oldest first):\n${untrusted("THREAD", thread)}` : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await generateText(userId, feature, { system, messages: [{ role: "user", content }], maxTokens: 900 });
    try {
      return { ...draftSchema.parse(parseJsonLoose(out)), doNotSay: profile.doNotSay };
    } catch {
      /* retry once */
    }
  }
  throw new Error("The AI returned an unusable response. Please try again.");
}

export const REWRITES: Record<string, string> = {
  shorter: "Make it shorter while keeping the meaning.",
  longer: "Expand it with a little more detail.",
  friendlier: "Make the tone friendlier.",
  formal: "Make the tone more formal.",
  grammar: "Fix grammar and spelling only; do not change the meaning.",
  translate: "Translate it to the language requested by the user.",
};

export async function rewrite(userId: string, action: string, text: string, language?: string) {
  const profile = await profilePrompt(userId);
  const instr = REWRITES[action];
  if (!instr) throw new Error("Unknown rewrite action");
  const out = await generateText(userId, "rewrite", {
    system: `You edit email drafts. ${SAFETY_RULES}\nBUSINESS PROFILE:\n${profile.text}\nKeep merge fields like {{firstName}} intact. Return only the rewritten text.`,
    messages: [{ role: "user", content: `${instr}${action === "translate" ? ` Target language: ${language ?? "English"}.` : ""}\n\n${untrusted("DRAFT", text)}` }],
    maxTokens: 900,
  });
  return out.trim();
}

export const needsReplySchema = z.object({ needsReply: z.boolean(), confidence: z.number().min(0).max(1).optional(), reason: z.string().optional() });

export async function classifyNeedsReply(userId: string, feature: string, m: Message, thread: string) {
  const out = await generateText(userId, feature, {
    system: `You classify incoming email. ${SAFETY_RULES}\nDecide whether the latest message needs a human-style reply from the recipient. Newsletters, notifications, receipts and pure thanks do not.\nRespond ONLY with JSON: {"needsReply": boolean, "confidence": number 0-1, "reason": string}`,
    messages: [{ role: "user", content: `Subject: ${m.subject}\nFrom: ${m.fromEmail}\n\n${untrusted("THREAD", thread)}` }],
    maxTokens: 150, temperature: 0,
  });
  try {
    return needsReplySchema.parse(parseJsonLoose(out));
  } catch {
    return { needsReply: false, confidence: 0, reason: "Classifier output unusable" };
  }
}
