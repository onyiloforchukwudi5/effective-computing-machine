import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./api";

export const responderFields = z.object({
  name: z.string().min(1).max(120), accountId: z.string(),
  sendViaType: z.enum(["ACCOUNT", "SMTP"]).default("ACCOUNT"), sendViaId: z.string().nullable().optional(),
  instructions: z.string().max(5000), knowledgeText: z.string().max(20000),
  onlyKnownContacts: z.boolean(), folderFilter: z.string().nullable().optional(), toAddressFilter: z.string().nullable().optional(),
  keywordsInclude: z.string().max(1000), keywordsExclude: z.string().max(1000),
  activeStartHour: z.number().int().min(0).max(24), activeEndHour: z.number().int().min(0).max(24), timezone: z.string(),
  maxRepliesPerContactPerDay: z.number().int().min(1).max(20), maxRepliesPerDay: z.number().int().min(1).max(500),
  cooldownHours: z.number().int().min(0).max(720), escalationKeywords: z.string().max(1000), saveCopyToSent: z.boolean(),
  maxAgeDays: z.number().int().min(1).max(30).default(3),
});

export async function checkOwnership(userId: string, accountId: string, type?: string, id?: string | null) {
  if (!(await db.mailAccount.findFirst({ where: { id: accountId, userId } }))) throw new HttpError("Mail account not found", 404);
  if (type === "SMTP" && id && !(await db.smtpSender.findFirst({ where: { id, userId } }))) throw new HttpError("SMTP sender not found", 404);
}

