import type { Job } from "bullmq";
import { simpleParser, AddressObject, ParsedMail } from "mailparser";
import type { MailAccount, Folder } from "@prisma/client";
import { db } from "../lib/db";
import { imapFor } from "../lib/mail/transport";
import { errText } from "../lib/net-guard";
import { emitNewInboxMessage } from "../lib/events";

const BATCH = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Addr = { name?: string; address: string };

function addrs(a: AddressObject | AddressObject[] | undefined): Addr[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list
    .flatMap((x) => x.value)
    .filter((v) => !!v.address)
    .map((v) => ({ name: v.name || undefined, address: v.address!.trim().toLowerCase() }));
}

function hdr(p: ParsedMail, k: string): string | null {
  const v = p.headers.get(k);
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(" ");
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  return String(v);
}

export async function processSync(job: Job<{ accountId: string; syncJobId: string }>) {
  const { accountId, syncJobId } = job.data;
  const account = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!account || account.status === "disconnected") {
    await db.syncJob.updateMany({ where: { id: syncJobId }, data: { status: "error", error: "Account unavailable", finishedAt: new Date() } });
    return;
  }
  await db.syncJob.update({ where: { id: syncJobId }, data: { status: "running", startedAt: new Date(), error: null } });
  await db.mailAccount.update({ where: { id: accountId }, data: { status: "syncing" } });
  const client = await imapFor(account);
  client.on("error", () => {});
  try {
    await client.connect();
    const boxes = (await client.list()).filter((b) => !b.flags.has("\\Noselect") && !b.flags.has("\\NonExistent"));
    await db.syncJob.update({ where: { id: syncJobId }, data: { foldersTotal: boxes.length } });
    let done = 0;
    for (const b of boxes) {
      const folder = await db.folder.upsert({
        where: { accountId_path: { accountId, path: b.path } },
        create: { accountId, path: b.path, name: b.name, specialUse: b.specialUse ?? (b.path.toUpperCase() === "INBOX" ? "\\Inbox" : null) },
        update: { name: b.name, specialUse: b.specialUse ?? (b.path.toUpperCase() === "INBOX" ? "\\Inbox" : null) },
      });
      await db.syncJob.update({ where: { id: syncJobId }, data: { currentFolder: b.path } });
      await syncFolder(client, account, folder, syncJobId);
      done++;
      await db.syncJob.update({ where: { id: syncJobId }, data: { foldersDone: done } });
    }
    await db.syncJob.update({ where: { id: syncJobId }, data: { status: "done", finishedAt: new Date(), currentFolder: null } });
    await db.mailAccount.update({ where: { id: accountId }, data: { status: "connected", lastError: null, lastSyncAt: new Date() } });
  } catch (e) {
    const msg = errText(e);
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await db.syncJob.update({ where: { id: syncJobId }, data: { status: final ? "error" : "queued", error: msg, ...(final ? { finishedAt: new Date() } : {}) } });
    await db.mailAccount.update({ where: { id: accountId }, data: { status: "error", lastError: msg } });
    throw e; // BullMQ retries with exponential backoff; per-folder progress makes it resume
  } finally {
    await client.logout().catch(() => {});
  }
}

async function syncFolder(client: Awaited<ReturnType<typeof imapFor>>, account: MailAccount, folder: Folder, syncJobId: string) {
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    const mb = client.mailbox;
    if (!mb) return;
    const uidValidity = String(mb.uidValidity);
    let lastUid = folder.lastUid;
    let backfilled = folder.backfilled;
    if (folder.uidValidity && folder.uidValidity !== uidValidity) {
      // UIDs are no longer valid: re-sync this folder from scratch
      await db.message.deleteMany({ where: { folderId: folder.id } });
      lastUid = 0;
      backfilled = false;
    }
    await db.folder.update({ where: { id: folder.id }, data: { uidValidity, lastUid, backfilled, totalMessages: mb.exists, done: false, ...(lastUid === 0 ? { fetched: 0 } : {}) } });
    if (mb.exists === 0) {
      await db.folder.update({ where: { id: folder.id }, data: { done: true, backfilled: true } });
      return;
    }
    const found = (await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || [];
    const uids = found.filter((u) => u > lastUid).sort((a, b) => a - b);
    const isInbox = folder.specialUse === "\\Inbox";
    for (let i = 0; i < uids.length; i += BATCH) {
      const chunk = uids.slice(i, i + BATCH);
      const fetched: { uid: number; flags: string[]; source: Buffer; date: Date }[] = [];
      for await (const m of client.fetch(chunk.join(","), { uid: true, flags: true, source: true, internalDate: true }, { uid: true })) {
        if (m.source) fetched.push({ uid: m.uid, flags: [...(m.flags ?? [])], source: m.source, date: m.internalDate instanceof Date ? m.internalDate : new Date() });
      }
      await storeBatch(account, folder, fetched, backfilled, isInbox, syncJobId);
      lastUid = chunk[chunk.length - 1];
      await db.folder.update({ where: { id: folder.id }, data: { lastUid, fetched: { increment: fetched.length } } });
      await sleep(250); // be gentle with provider rate limits
    }
    await db.folder.update({ where: { id: folder.id }, data: { done: true, backfilled: true } });
  } finally {
    lock.release();
  }
}

async function storeBatch(
  account: MailAccount, folder: Folder,
  items: { uid: number; flags: string[]; source: Buffer; date: Date }[],
  backfilled: boolean, isInbox: boolean, syncJobId: string,
) {
  const own = new Set((await db.mailAccount.findMany({ where: { userId: account.userId }, select: { email: true } })).map((a) => a.email.toLowerCase()));
  const agg = new Map<string, { name?: string; count: number; first: Date; last: Date }>();
  let newContacts = 0;
  const stored: Awaited<ReturnType<typeof db.message.create>>[] = [];
  for (const it of items) {
    if (await db.message.findUnique({ where: { folderId_uid: { folderId: folder.id, uid: it.uid } }, select: { id: true } })) continue;
    const p = await simpleParser(it.source);
    const from = addrs(p.from);
    const to = addrs(p.to), cc = addrs(p.cc), replyTo = addrs(p.replyTo);
    const bcc = addrs((p as ParsedMail & { bcc?: AddressObject }).bcc);
    const date = p.date ?? it.date;
    const headEnd = it.source.indexOf("\r\n\r\n");
    const msg = await db.message.create({
      data: {
        accountId: account.id, folderId: folder.id, uid: it.uid,
        messageIdHeader: p.messageId ?? null,
        inReplyTo: p.inReplyTo ?? null,
        references: Array.isArray(p.references) ? p.references.join(" ") : (p.references ?? null),
        listId: hdr(p, "list-id"), listUnsubscribe: hdr(p, "list-unsubscribe"), precedence: hdr(p, "precedence"),
        autoSubmitted: hdr(p, "auto-submitted"), xAutoResponseSuppress: hdr(p, "x-auto-response-suppress"),
        rawHeaders: it.source.subarray(0, headEnd > 0 ? headEnd : 8192).toString("utf8").slice(0, 65536),
        subject: p.subject ?? null, fromName: from[0]?.name ?? null, fromEmail: from[0]?.address ?? null,
        toAddrs: to, ccAddrs: cc, replyToAddrs: replyTo,
        textBody: p.text ?? null, htmlBody: typeof p.html === "string" ? p.html : null,
        attachments: p.attachments.map((a) => ({ filename: a.filename ?? null, contentType: a.contentType, size: a.size })),
        flags: it.flags, receivedAt: date, isNew: backfilled,
      },
    });
    stored.push(msg);
    const seen = new Set<string>();
    for (const a of [...from, ...to, ...cc, ...bcc, ...replyTo]) {
      if (own.has(a.address) || seen.has(a.address)) continue;
      seen.add(a.address);
      const cur = agg.get(a.address);
      if (cur) {
        cur.count++;
        if (date < cur.first) cur.first = date;
        if (date > cur.last) cur.last = date;
        cur.name ||= a.name;
      } else agg.set(a.address, { name: a.name, count: 1, first: date, last: date });
    }
  }
  for (const [email, v] of agg) {
    const existing = await db.contact.findUnique({ where: { userId_email: { userId: account.userId, email } } });
    let contactId: string;
    if (existing) {
      contactId = existing.id;
      await db.contact.update({
        where: { id: existing.id },
        data: {
          messageCount: { increment: v.count }, name: existing.name || v.name || null,
          firstSeen: v.first < existing.firstSeen ? v.first : undefined, lastSeen: v.last > existing.lastSeen ? v.last : undefined,
        },
      });
    } else {
      const c = await db.contact.create({ data: { userId: account.userId, email, name: v.name ?? null, messageCount: v.count, firstSeen: v.first, lastSeen: v.last } });
      contactId = c.id;
      newContacts++;
    }
    await db.contactSource.upsert({
      where: { contactId_accountId_folderPath: { contactId, accountId: account.id, folderPath: folder.path } },
      create: { contactId, accountId: account.id, folderPath: folder.path, count: v.count },
      update: { count: { increment: v.count } },
    });
  }
  await db.syncJob.update({ where: { id: syncJobId }, data: { messagesFetched: { increment: stored.length }, contactsFound: { increment: newContacts } } });
  if (backfilled && isInbox) for (const m of stored) await emitNewInboxMessage({ ...m, userId: account.userId });
}
