import dns from "dns/promises";
import net from "net";
import { randomBytes } from "crypto";
import { redis } from "./redis";

export type VStatus = "valid" | "invalid" | "risky" | "unknown";
export type VResult = { status: VStatus; reason: string; smtpCode?: number; smtpMessage?: string; retryLater?: boolean };

const DISPOSABLE = new Set(["mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "yopmail.com", "trashmail.com", "throwawaymail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "temp-mail.org", "fakeinbox.com"]);
const ROLES = new Set(["info", "admin", "support", "sales", "contact", "hello", "help", "billing", "postmaster", "abuse", "noreply", "no-reply", "webmaster", "office", "team", "marketing"]);
const ACCEPT_ALL_DOMAINS = /^(gmail\.com|googlemail\.com|yahoo\.[a-z.]+|ymail\.com|outlook\.com|hotmail\.[a-z.]+|live\.[a-z.]+|msn\.com|icloud\.com|me\.com|aol\.com)$/i;
const ACCEPT_ALL_MX = /(google\.com|googlemail\.com|outlook\.com|protection\.outlook|yahoodns\.net|icloud\.com)\.?$/i;

export const SYNTAX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

type SmtpReply = { code: number; text: string };

class SmtpSession {
  private sock!: net.Socket;
  private buf = "";
  private waiters: ((r: SmtpReply) => void)[] = [];
  private queue: SmtpReply[] = [];
  private err: Error | null = null;

  async connect(host: string, port: number, timeout: number) {
    await new Promise<void>((res, rej) => {
      this.sock = net.connect({ host, port });
      this.sock.setTimeout(timeout, () => { this.sock.destroy(); rej(new Error("timeout")); });
      this.sock.once("connect", () => res());
      this.sock.once("error", (e) => rej(e));
      this.sock.on("data", (d) => this.onData(d.toString("utf8")));
      this.sock.on("error", (e) => { this.err = e; this.flush(); });
      this.sock.on("close", () => { this.err ??= new Error("closed"); this.flush(); });
    });
  }
  private onData(s: string) {
    this.buf += s;
    let i: number;
    while ((i = this.buf.indexOf("\r\n")) >= 0) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      const m = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!m) continue;
      if (m[2] === " ") {
        const r = { code: Number(m[1]), text: line };
        const w = this.waiters.shift();
        if (w) w(r); else this.queue.push(r);
      }
    }
  }
  private flush() {
    for (const w of this.waiters.splice(0)) w({ code: 0, text: this.err?.message ?? "closed" });
  }
  read(): Promise<SmtpReply> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    if (this.err) return Promise.resolve({ code: 0, text: this.err.message });
    return new Promise((r) => this.waiters.push(r));
  }
  async cmd(c: string): Promise<SmtpReply> {
    this.sock.write(`${c}\r\n`);
    return this.read();
  }
  close() {
    this.sock.destroy();
  }
}

async function mxFor(domain: string): Promise<string[]> {
  const key = `vfy:mx:${domain}`;
  const cached = await redis().get(key);
  if (cached) return JSON.parse(cached);
  let hosts: string[] = [];
  try {
    hosts = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((m) => m.exchange);
  } catch {
    try {
      if ((await dns.resolve4(domain)).length) hosts = [domain];
    } catch {
      hosts = [];
    }
  }
  await redis().set(key, JSON.stringify(hosts), "EX", 6 * 3600);
  return hosts;
}

type Probe = { rcpt: SmtpReply; catchAll: boolean | null };

async function probe(mx: string, email: string, domain: string, checkCatchAll: boolean): Promise<Probe | { error: string }> {
  const s = new SmtpSession();
  try {
    await s.connect(mx, 25, 12_000);
    const g = await s.read();
    if (g.code !== 220) return { error: `Greeting: ${g.text}` };
    let h = await s.cmd(`EHLO ${process.env.VERIFY_HELO || "localhost"}`);
    if (h.code !== 250) h = await s.cmd(`HELO ${process.env.VERIFY_HELO || "localhost"}`);
    const mf = await s.cmd(`MAIL FROM:<${process.env.VERIFY_FROM || "verify@example.com"}>`);
    if (mf.code !== 250) return { rcpt: mf, catchAll: null };
    const rcpt = await s.cmd(`RCPT TO:<${email}>`);
    let catchAll: boolean | null = null;
    const ck = `vfy:catchall:${domain}`;
    const cached = await redis().get(ck);
    if (cached) catchAll = cached === "1";
    else if (checkCatchAll && rcpt.code === 250) {
      const fake = await s.cmd(`RCPT TO:<zz${randomBytes(6).toString("hex")}@${domain}>`);
      catchAll = fake.code === 250;
      await redis().set(ck, catchAll ? "1" : "0", "EX", 24 * 3600);
    }
    await s.cmd("QUIT").catch(() => {});
    return { rcpt, catchAll };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "connection failed" };
  } finally {
    s.close();
  }
}

export async function waitForDomainSlot(domain: string) {
  for (let i = 0; i < 30; i++) {
    const r = redis();
    const k = `vfy:rl:${domain}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, 60);
    if (n <= 6) return; // per-domain: 6 probes/min
    await new Promise((res) => setTimeout(res, 2000));
  }
}

export async function verifyAddress(raw: string): Promise<VResult> {
  const email = raw.trim().toLowerCase();
  if (!SYNTAX.test(email) || email.length > 254) return { status: "invalid", reason: "Invalid syntax" };
  const [local, domain] = email.split("@");
  if (DISPOSABLE.has(domain)) return { status: "risky", reason: "Disposable domain" };
  const role = ROLES.has(local);
  const mxs = await mxFor(domain);
  if (!mxs.length) return { status: "invalid", reason: "Domain has no MX or A record" };
  if (ACCEPT_ALL_DOMAINS.test(domain) || ACCEPT_ALL_MX.test(mxs[0])) return { status: role ? "risky" : "unknown", reason: role ? "Role address; provider accepts all" : "Provider accepts all addresses; cannot verify" };
  await waitForDomainSlot(domain);
  const p = await probe(mxs[0], email, domain, true);
  if ("error" in p) return { status: "unknown", reason: `SMTP check failed (port 25 may be blocked): ${p.error}` };
  const { code, text } = p.rcpt;
  const base = { smtpCode: code, smtpMessage: text.slice(0, 300) };
  if ([550, 551, 553].includes(code)) return { status: "invalid", reason: "Mailbox not found", ...base };
  if (code >= 400 && code < 500) return { status: "unknown", reason: "Temporary failure / greylisted", retryLater: true, ...base };
  if (code === 250 || code === 251) {
    if (p.catchAll) return { status: "risky", reason: "Catch-all domain", ...base };
    if (role) return { status: "risky", reason: "Role address", ...base };
    return { status: "valid", reason: "Mailbox accepted", ...base };
  }
  return { status: "unknown", reason: "Unexpected SMTP response", ...base };
}

export async function testPort25(): Promise<{ reachable: boolean; detail: string }> {
  const s = new SmtpSession();
  try {
    await s.connect("gmail-smtp-in.l.google.com", 25, 8000);
    const g = await s.read();
    await s.cmd("QUIT").catch(() => {});
    return { reachable: g.code === 220, detail: g.text };
  } catch (e) {
    return { reachable: false, detail: e instanceof Error ? e.message : "failed" };
  } finally {
    s.close();
  }
}
