import type { Prisma } from "@prisma/client";

export function contactWhere(userId: string, sp: URLSearchParams): Prisma.ContactWhereInput {
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const accountId = sp.get("accountId");
  return {
    userId,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status ? (status === "unverified" ? { verificationStatus: null } : { verificationStatus: status }) : {}),
    ...(sp.get("hideInvalid") === "1" ? { NOT: { verificationStatus: "invalid" } } : {}),
    ...(accountId ? { sources: { some: { accountId } } } : {}),
  };
}

