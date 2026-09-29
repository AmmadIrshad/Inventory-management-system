import "server-only";
import { Secret, TOTP } from "otpauth";

export const TOTP_ISSUER = "Inventory";
const TOTP_PERIOD_SECONDS = 30;

function createTotp(secretBase32: string, label = "account") {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: "SHA1", // the only algorithm every authenticator app supports
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** 160-bit secret, base32 encoded (the format authenticator apps expect). */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** `otpauth://` URI for the QR code. */
export function totpKeyUri(secretBase32: string, accountName: string): string {
  return createTotp(secretBase32, accountName).toString();
}

export function generateTotpCode(secretBase32: string, timestamp = Date.now()): string {
  return createTotp(secretBase32).generate({ timestamp });
}

/**
 * Returns the time-step the code belongs to (for replay protection), or null if invalid.
 * Accepts one step of clock drift in either direction.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  timestamp = Date.now(),
): number | null {
  const totp = createTotp(secretBase32);
  const delta = totp.validate({ token: code, timestamp, window: 1 });
  return delta === null ? null : totp.counter({ timestamp }) + delta;
}

export function isTotpCodeFormat(input: string): boolean {
  return /^\d{6}$/.test(input);
}
