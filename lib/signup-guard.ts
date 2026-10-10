import { rateLimit } from "./redis";

/** Emergency brake: only the literal string "false" closes sign-ups. */
export const signupsEnabled = () => process.env.SIGNUPS_ENABLED?.trim() !== "false";

const cap = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Global cap on NEW accounts. Redis errors fail closed (false). */
export async function newAccountAllowed(): Promise<boolean> {
  try {
    return (
      (await rateLimit("signup:global:hour", cap("SIGNUP_MAX_PER_HOUR", 100), 3600)) &&
      (await rateLimit("signup:global:day", cap("SIGNUP_MAX_PER_DAY", 500), 86400))
    );
  } catch {
    return false;
  }
}

export const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");
