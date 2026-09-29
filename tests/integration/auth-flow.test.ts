// Walks the phase-one flowchart against a real PostgreSQL database.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTotpCode } from "@/lib/totp";
import { MAX_TWO_FACTOR_ATTEMPTS } from "@/lib/auth/constants";
import { registerUser, verifyCredentials } from "@/lib/auth/users";
import {
  authStateOf,
  createSession,
  markSessionTwoFactorVerified,
  recordFailedTwoFactorAttempt,
  validateSessionToken,
} from "@/lib/auth/session";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  countRemainingRecoveryCodes,
  disableTwoFactor,
  getPendingTotpEnrollment,
  verifySecondFactor,
} from "@/lib/auth/two-factor";
import {
  createPasswordResetToken,
  findValidPasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import { resetDatabase } from "../support/db";

const STRONG_PASSWORD = "correct-horse-battery-staple-lantern";
const NEW_STRONG_PASSWORD = "violet-harbor-quantum-pickle-44";
const NEXT_STEP_MS = 30_000;

async function createUser(email = "priya@example.com") {
  const result = await registerUser({ name: "Priya Sharma", email, password: STRONG_PASSWORD });
  if (!result.ok) throw new Error(JSON.stringify(result.fieldErrors));
  return result.user;
}

async function createUserWithTwoFactor() {
  const user = await createUser();
  await beginTotpEnrollment(user.id);
  const enrollment = await getPendingTotpEnrollment(user.id);
  if (!enrollment) throw new Error("enrollment missing");
  const confirmed = await confirmTotpEnrollment(user.id, generateTotpCode(enrollment.secret));
  if (!confirmed.ok) throw new Error("enrollment failed");
  return { user, secret: enrollment.secret, recoveryCodes: confirmed.recoveryCodes };
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("sign-up", () => {
  it("rejects a weak password", async () => {
    const result = await registerUser({ name: "Priya", email: "p@example.com", password: "password123" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.password?.length).toBeGreaterThan(0);
  });

  it("creates the account once per email", async () => {
    const user = await createUser();
    expect(user).toMatchObject({ email: "priya@example.com", totpEnabledAt: null });

    const duplicate = await registerUser({ name: "Other", email: "priya@example.com", password: STRONG_PASSWORD });
    expect(duplicate.ok).toBe(false);
    expect(!duplicate.ok && duplicate.fieldErrors.email).toBeDefined();
  });

  it("stores an argon2id hash, never the password", async () => {
    await createUser();
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "priya@example.com" } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(STRONG_PASSWORD);
  });
});

describe("are creds correct?", () => {
  it("accepts the right password and rejects wrong password or unknown email", async () => {
    const user = await createUser();
    expect((await verifyCredentials("priya@example.com", STRONG_PASSWORD))?.id).toBe(user.id);
    expect(await verifyCredentials("priya@example.com", "wrong-password")).toBeNull();
    expect(await verifyCredentials("nobody@example.com", STRONG_PASSWORD)).toBeNull();
  });
});

describe("two-factor enrollment", () => {
  it("only enables 2FA after a valid code and returns 10 recovery codes", async () => {
    const user = await createUser();
    await beginTotpEnrollment(user.id);
    const enrollment = await getPendingTotpEnrollment(user.id);
    expect(enrollment?.keyUri).toMatch(/^otpauth:\/\/totp\//);

    expect((await confirmTotpEnrollment(user.id, "000000")).ok).toBe(false);

    const confirmed = await confirmTotpEnrollment(user.id, generateTotpCode(enrollment!.secret));
    expect(confirmed.ok && confirmed.recoveryCodes).toHaveLength(10);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabledAt).not.toBeNull();
    expect(row.totpSecret).not.toContain(enrollment!.secret); // encrypted at rest
  });
});

describe("is the 2FA a TOTP or a recovery code?", () => {
  it("TOTP: correct code passes, the same code can't be replayed, wrong codes fail", async () => {
    const { user, secret } = await createUserWithTwoFactor();
    const code = generateTotpCode(secret, Date.now() + NEXT_STEP_MS);

    expect(await verifySecondFactor(user.id, code)).toEqual({ ok: true, method: "totp" });
    expect(await verifySecondFactor(user.id, code)).toEqual({ ok: false });
    expect(await verifySecondFactor(user.id, "000000")).toEqual({ ok: false });
  });

  it("recovery code: passes once, is marked used, and can't be reused", async () => {
    const { user, recoveryCodes } = await createUserWithTwoFactor();
    const [code] = recoveryCodes;

    expect(await verifySecondFactor(user.id, code.toUpperCase())).toEqual({
      ok: true,
      method: "recovery-code",
      remainingRecoveryCodes: 9,
    });
    const used = await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: { not: null } } });
    expect(used).toBe(1);
    expect(await verifySecondFactor(user.id, code)).toEqual({ ok: false });
    expect(await countRemainingRecoveryCodes(user.id)).toBe(9);
  });

  it("user wants to remove 2FA: secret and codes are deleted", async () => {
    const { user } = await createUserWithTwoFactor();
    await disableTwoFactor(user.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ totpSecret: null, totpEnabledAt: null });
    expect(await prisma.recoveryCode.count({ where: { userId: user.id } })).toBe(0);
    expect((await verifyCredentials(user.email, STRONG_PASSWORD))?.totpEnabledAt).toBeNull();
  });
});

describe("sessions", () => {
  it("a 2FA user is pending after the password step and signed in after the code", async () => {
    const { user } = await createUserWithTwoFactor();
    const signedIn = await verifyCredentials(user.email, STRONG_PASSWORD);
    const { token, session } = await createSession(signedIn!);

    const pending = await validateSessionToken(token);
    expect(pending && authStateOf(pending)).toBe("pending-two-factor");

    await markSessionTwoFactorVerified(session.id);
    const verified = await validateSessionToken(token);
    expect(verified && authStateOf(verified)).toBe("authenticated");
  });

  it("stores only a hash of the session token", async () => {
    const user = await createUser();
    const { token, session } = await createSession(user);
    expect(session.id).not.toBe(token);
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it(`deletes the session after ${MAX_TWO_FACTOR_ATTEMPTS} wrong codes`, async () => {
    const { user } = await createUserWithTwoFactor();
    const { token, session } = await createSession(user);

    for (let attempt = 1; attempt < MAX_TWO_FACTOR_ATTEMPTS; attempt++) {
      expect(await recordFailedTwoFactorAttempt(session.id)).toBe(MAX_TWO_FACTOR_ATTEMPTS - attempt);
    }
    expect(await recordFailedTwoFactorAttempt(session.id)).toBe(0);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("rejects and cleans up expired sessions", async () => {
    const user = await createUser();
    const { token, session } = await createSession(user);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await validateSessionToken(token)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("forgot password", () => {
  it("issues nothing for unknown emails", async () => {
    expect(await createPasswordResetToken("nobody@example.com")).toBeNull();
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("pw strong? NO: rejects a weak new password and keeps the link usable", async () => {
    await createUser();
    const issued = await createPasswordResetToken("priya@example.com");

    const result = await resetPasswordWithToken(issued!.token, "password123");
    expect(result).toMatchObject({ ok: false, reason: "weak-password" });
    expect(await findValidPasswordResetToken(issued!.token)).not.toBeNull();
  });

  it("pw strong? YES: changes the password, signs everyone out and burns the link", async () => {
    const user = await createUser();
    const { token: sessionToken } = await createSession(user);
    const issued = await createPasswordResetToken("priya@example.com");

    expect(await resetPasswordWithToken(issued!.token, NEW_STRONG_PASSWORD)).toEqual({ ok: true });

    expect(await validateSessionToken(sessionToken)).toBeNull();
    expect(await verifyCredentials(user.email, STRONG_PASSWORD)).toBeNull();
    expect((await verifyCredentials(user.email, NEW_STRONG_PASSWORD))?.id).toBe(user.id);
    expect(await resetPasswordWithToken(issued!.token, "another-very-strong-passphrase-99")).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });

  it("only the newest link works, and links expire", async () => {
    await createUser();
    const first = await createPasswordResetToken("priya@example.com");
    const second = await createPasswordResetToken("priya@example.com");
    expect(await findValidPasswordResetToken(first!.token)).toBeNull();
    expect(await findValidPasswordResetToken(second!.token)).not.toBeNull();

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resetPasswordWithToken(second!.token, NEW_STRONG_PASSWORD)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });
});
