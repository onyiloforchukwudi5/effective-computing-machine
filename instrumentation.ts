export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  try {
    const e = process.env;
    const warn = (m: string) => console.warn(`[config] ${m}`);
    if (!e.SITE_RESEND_API_KEY && !e.SITE_POSTMARK_TOKEN && !e.SITE_SMTP_HOST) warn("Sign-up will fail: no site email provider configured");
    if (!e.SITE_MAIL_FROM) warn("SITE_MAIL_FROM is not set: site emails cannot be sent");
    if (!e.APP_URL || !e.APP_URL.startsWith("https://")) warn("APP_URL is unset or not https: email links and OAuth redirects may be wrong");
    if (e.SIGNUPS_ENABLED && !["true", "false"].includes(e.SIGNUPS_ENABLED.trim())) warn("SIGNUPS_ENABLED should be 'true' or 'false' (only 'false' closes sign-ups)");
    if (e.GOOGLE_CLIENT_ID && !e.GOOGLE_CLIENT_SECRET) warn("GOOGLE_CLIENT_ID is set without GOOGLE_CLIENT_SECRET: Google sign-in will fail");
    if (!e.SITE_MAIL_MAX_PER_DAY) warn("SITE_MAIL_MAX_PER_DAY is left at the default (100): set it to match your email provider plan");
  } catch {
    /* never stop the server */
  }
}
