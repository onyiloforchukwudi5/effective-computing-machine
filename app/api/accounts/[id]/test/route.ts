import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";
import { testAccount } from "@/lib/mail/test-connection";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const a = await db.mailAccount.findFirst({ where: { id, userId: user.id } });
  if (!a) throw new HttpError("Not found", 404);
  const t = await testAccount(a);
  await db.mailAccount.update({
    where: { id },
    data: { status: t.ok ? "connected" : "error", lastError: t.ok ? null : [t.imap, t.smtp].filter((x) => x !== "OK").join(" | "), lastTestedAt: new Date() },
  });
  return json(t);
});
