import type { MailAccount } from "@prisma/client";
import { errText } from "../net-guard";
import { imapFor, smtpFor } from "./transport";

export async function testAccount(a: MailAccount): Promise<{ ok: boolean; imap: string; smtp: string }> {
  let imap = "OK";
  let smtp = "OK";
  try {
    const c = await imapFor(a);
    c.on("error", () => {});
    await c.connect();
    await c.logout();
  } catch (e) {
    imap = `IMAP: ${errText(e)}`;
  }
  try {
    await (await smtpFor(a)).verify();
  } catch (e) {
    smtp = `SMTP: ${errText(e)}`;
  }
  return { ok: imap === "OK" && smtp === "OK", imap, smtp };
}
