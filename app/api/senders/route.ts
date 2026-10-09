import { db } from "@/lib/db";
import { authed, body, json } from "@/lib/api";
import { encryptOpt } from "@/lib/crypto";
import { assertSafeTarget } from "@/lib/net-guard";
import { publicSender } from "@/lib/serialize";
import { senderSchema, testSender } from "@/lib/mail/senders";

export const GET = authed(async (_req, user) => {
  const rows = await db.smtpSender.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return json(rows.map(publicSender));
});

export const POST = authed(async (req, user) => {
  const { password, replyTo, isDefault, ...d } = await body(req, senderSchema);
  await assertSafeTarget(d.host, d.port, "smtp");
  const count = await db.smtpSender.count({ where: { userId: user.id } });
  const makeDefault = isDefault || count === 0;
  if (makeDefault) await db.smtpSender.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  const s = await db.smtpSender.create({
    data: { ...d, userId: user.id, replyTo: replyTo || null, passwordEnc: encryptOpt(password), isDefault: makeDefault },
  });
  const test = await testSender(s.id);
  const fresh = await db.smtpSender.findUniqueOrThrow({ where: { id: s.id } });
  return json({ sender: publicSender(fresh), test }, 201);
});
