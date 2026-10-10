import list from "disposable-email-domains/index.json";
import { domainOf } from "./deliverability";

const csv = (v: string | undefined) => new Set((v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

const BLOCKED = new Set<string>([...(list as string[]), ...csv(process.env.SITE_BLOCKED_DOMAINS)]);
const ALLOWED = csv(process.env.SITE_ALLOWED_DOMAINS);

/** True if the domain (or any parent domain) is a known throwaway provider. Only used when creating accounts. */
export function isDisposableEmail(email: string): boolean {
  const parts = domainOf(email).split(".").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    if (ALLOWED.has(d)) return false;
  }
  for (let i = 0; i < parts.length - 1; i++) {
    if (BLOCKED.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
