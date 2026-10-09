import { z } from "zod";
import { db } from "../db";
import { assertSafeTarget } from "../net-guard";
import { smtpSenderTransport } from "./transport";
import { errText } from "../net-guard";

export const senderSchema = z.object({
  label: z.string().min(1).max(80),
  host: z.string().min(1),
  port: z.number().int(),
  security: z.enum(["SSL", "STARTTLS", "NONE"]),
  username: z.string().optional().nullable(),
  password: z.string().optional(),
  fromName: z.string().min(1).max(120),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable().or(z.literal("")),
  isDefault: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(100000).optional(),
});

export async function testSender(id: string) {
  const s = await db.smtpSender.findUniqueOrThrow({ where: { id } });
  let ok = true;
  let error: string | null = null;
  try {
    await assertSafeTarget(s.host, s.port, "smtp");
    await smtpSenderTransport(s).verify();
  } catch (e) {
    ok = false;
    error = errText(e);
  }
  await db.smtpSender.update({ where: { id }, data: { status: ok ? "connected" : "error", lastError: error, lastTestedAt: new Date() } });
  return { ok, error };
}
