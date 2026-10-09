// All deliverability copy lives here so it is easy to edit.
export const HINT_COPY = {
  general: (domain: string) =>
    `To keep your emails out of spam, set up SPF, DKIM and DMARC for ${domain || "your sending domain"} with your SMTP provider. Add the DNS records your provider gives you, and send from an address on a domain you own.`,
  freeMail: (domain: string) =>
    `You are sending from ${domain}, but not through ${domain}'s own servers. Mail sent this way is often rejected or sent to spam because ${domain} only authorizes its own servers. Use an address on a domain you own instead.`,
  composer: (domain: string, host: string) =>
    `Sending from ${domain} through ${host}. Replies can land in spam unless SPF and DKIM are set up for this domain with your provider.`,
  rejectionAppend:
    "Hint: this looks like an SPF/DKIM/DMARC rejection. Set up SPF, DKIM and DMARC for your sending domain with your SMTP provider and send from a domain you own.",
  providerTip: "Verify your sending domain in your provider's dashboard and add the DKIM/SPF records.",
  rampUp: "New senders and domains should ramp up slowly: start with a few dozen emails a day and increase gradually.",
  coldEmailLaw:
    "Cold email is regulated (CAN-SPAM, GDPR, PECR and others). You are responsible for having a lawful basis or consent, honoring unsubscribes, and including a valid postal address.",
  replyDetection: "Reply detection needs the sending address's inbox connected, or replies must go to a connected mailbox (set Reply-To).",
  aiPrivacy: "Email text and your business profile are sent to the chosen AI provider to generate drafts.",
  aiWrong: "AI replies can be wrong. You are responsible for everything that is sent.",
};

export const FREE_MAIL: Record<string, string[]> = {
  "gmail.com": ["gmail.com", "googlemail.com"],
  "googlemail.com": ["gmail.com", "googlemail.com"],
  "yahoo.com": ["yahoo.com", "yahoo.co.uk", "yahoodns.net"],
  "outlook.com": ["outlook.com", "office365.com", "outlook.office365.com", "hotmail.com"],
  "hotmail.com": ["outlook.com", "office365.com", "hotmail.com"],
  "live.com": ["outlook.com", "office365.com", "hotmail.com"],
  "icloud.com": ["icloud.com", "me.com", "mail.me.com"],
  "aol.com": ["aol.com"],
  "proton.me": ["proton.me", "protonmail.ch"],
  "protonmail.com": ["proton.me", "protonmail.ch"],
};

const PROVIDERS: [RegExp, string][] = [
  [/sendgrid/i, "SendGrid"], [/mailgun/i, "Mailgun"], [/amazonaws\.com|email-smtp/i, "Amazon SES"],
  [/brevo|sendinblue/i, "Brevo"], [/postmarkapp/i, "Postmark"],
];

export function domainOf(email: string): string {
  const m = /^[^@\s]+@([^@\s]+)$/.exec(email.trim().toLowerCase());
  return m ? m[1] : "";
}

export function providerOf(host: string): string | null {
  return PROVIDERS.find(([re]) => re.test(host))?.[1] ?? null;
}

/** True if From is on a free-mail domain but the host is not that provider's own SMTP. */
export function isFreeMailMismatch(fromEmail: string, host: string): boolean {
  const allowed = FREE_MAIL[domainOf(fromEmail)];
  if (!allowed) return false;
  const h = host.toLowerCase();
  return !allowed.some((a) => h.includes(a.split(".")[0]) && h.includes("."));
}

export function hintFor(fromEmail: string, host: string) {
  const domain = domainOf(fromEmail);
  return {
    domain,
    general: HINT_COPY.general(domain),
    freeMailWarning: domain && isFreeMailMismatch(fromEmail, host) ? HINT_COPY.freeMail(domain) : null,
    providerTip: providerOf(host) ? `${providerOf(host)}: ${HINT_COPY.providerTip}` : null,
  };
}

export function looksLikeAuthRejection(msg: string): boolean {
  return /5\.7\.\d+|spf|dkim|dmarc|unauthenticated|not authorized/i.test(msg) && /(^|\D)55\d|5\.7\./.test(msg);
}

export function withDeliverabilityHint(msg: string): string {
  return looksLikeAuthRejection(msg) ? `${msg}\n${HINT_COPY.rejectionAppend}` : msg;
}
