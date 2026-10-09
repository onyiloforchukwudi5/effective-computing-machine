import { db } from "@/lib/db";
import { authed, body, HttpError, json } from "@/lib/api";
import { encryptOpt } from "@/lib/crypto";
import { assertSafeTarget } from "@/lib/net-guard";
import { publicSender } from "@/lib/serialize";
import { senderSchema, testSender } from "@/lib/mail/senders";

async function own(userId: string, id: string) {
  const s = await db.smtpSender.findFirst({ where: { id, userId } });
  if (!s) throw new HttpError("Not found", 404);
  return s;
}

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  await own(user.id, id);
  const { password, replyTo, isDefault, ...rest } = await body(req, senderSchema.partial());
  if (rest.host || rest.port) {
    const cur = await own(user.id, id);
    await assertSafeTarget(rest.host ?? cur.host, rest.port ?? cur.port, "smtp");
  }
  if (isDefault) await db.smtpSender.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  await db.smtpSender.update({
    where: { id },
    data: {
      ...rest,
      ...(replyTo !== undefined ? { replyTo: replyTo || null } : {}),
      ...(password ? { passwordEnc: encryptOpt(password) } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    },
  });
  const test = await testSender(id);
  return json({ sender: publicSender(await own(user.id, id)), test });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const s = await own(user.id, id);
  await db.smtpSender.delete({ where: { id } });
  if (s.isDefault) {
    const next = await db.smtpSender.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    if (next) await db.smtpSender.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return json({ ok: true });
});
