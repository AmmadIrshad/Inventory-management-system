import { describe, expect, it } from "vitest";
import {
  generateTotpCode,
  generateTotpSecret,
  isTotpCodeFormat,
  totpKeyUri,
  verifyTotpCode,
} from "@/lib/totp";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeFormat,
  RECOVERY_CODE_COUNT,
} from "@/lib/recovery-codes";

const PERIOD_MS = 30_000;

describe("TOTP", () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 8, 29, 12, 0, 0);

  it("creates a 160-bit base32 secret and an otpauth URI", () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = totpKeyUri(secret, "priya@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\/Inventory:priya%40example\.com\?/);
    expect(uri).toContain(`secret=${secret}`);
  });

  it("accepts the current code and returns its time-step", () => {
    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(Math.floor(now / PERIOD_MS));
  });

  it("tolerates one step of clock drift, not two", () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, now - PERIOD_MS), now)).not.toBeNull();
    expect(verifyTotpCode(secret, generateTotpCode(secret, now + PERIOD_MS), now)).not.toBeNull();
    expect(verifyTotpCode(secret, generateTotpCode(secret, now - 2 * PERIOD_MS), now)).toBeNull();
  });

  it("rejects wrong codes", () => {
    const code = generateTotpCode(secret, now);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotpCode(secret, wrong, now)).toBeNull();
  });

  it("recognises the 6-digit format", () => {
    expect(isTotpCodeFormat("012345")).toBe(true);
    expect(isTotpCodeFormat("12345")).toBe(false);
    expect(isTotpCodeFormat("abcdef")).toBe(false);
  });
});

describe("recovery codes", () => {
  it("generates unique, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
      expect(code).not.toMatch(/[01ilo]/);
    }
  });

  it("normalises case, spaces and dashes before hashing", () => {
    const [code] = generateRecoveryCodes(1);
    const sloppy = ` ${code.toUpperCase().replaceAll("-", " ")} `;
    expect(isRecoveryCodeFormat(sloppy)).toBe(true);
    expect(hashRecoveryCode(sloppy)).toBe(hashRecoveryCode(code));
  });

  it("never mistakes a TOTP code for a recovery code", () => {
    expect(isRecoveryCodeFormat("123456")).toBe(false);
  });
});
