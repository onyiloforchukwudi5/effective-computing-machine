import { db } from "@/lib/db";
import { authed, HttpError, json } from "@/lib/api";

export const GET = authed(async (req, user) => {
  const accountId = new URL(req.url).searchParams.get("accountId") ?? "";
  if (!(await db.mailAccount.findFirst({ where: { id: accountId, userId: user.id } }))) throw new HttpError("Not found", 404);
  const folders = await db.folder.findMany({ where: { accountId }, orderBy: { path: "asc" }, include: { _count: { select: { messages: true } } } });
  return json(folders.map((f) => ({ id: f.id, path: f.path, name: f.name, specialUse: f.specialUse, count: f._count.messages })));
});
