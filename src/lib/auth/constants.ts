// No `server-only` here: this module is also imported by `src/proxy.ts`.

export const SESSION_COOKIE = "session";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Active sessions are extended once less than this much lifetime remains. */
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;
/** A password-verified session waiting for its second factor. */
export const PENDING_TWO_FACTOR_TTL_MS = 10 * 60 * 1000;
export const MAX_TWO_FACTOR_ATTEMPTS = 5;

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

export function shouldUseSecureCookies(): boolean {
  return process.env.APP_URL?.startsWith("https://") ?? false;
}
