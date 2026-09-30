// Walks the phase-one flows against a real PostgreSQL database.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTotpCode } from "@/lib/totp";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { MAX_TWO_FACTOR_ATTEMPTS } from "@/lib/auth/constants";
import { registerUser, verifyCredentials } from "@/lib/auth/users";
import {
  createEmailVerificationToken,
  findUnverifiedUser,
  verifyEmailWithToken,
} from "@/lib/auth/email-verification";
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
  disableTwoFactorWithProof,
  disableTwoFactorWithRecoveryCode,
  getPendingTotpEnrollment,
  verifyAuthenticatorCode,
} from "@/lib/auth/two-factor";
import {
  createPasswordResetToken,
  findValidPasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import { signInWithGoogle, type GoogleProfile } from "@/lib/auth/google-accounts";
import { resetDatabase } from "../support/db";

const STRONG_PASSWORD = "correct-horse-battery-staple-lantern";
const NEW_STRONG_PASSWORD = "violet-harbor-quantum-pickle-44";
const NEXT_STEP_MS = 30_000;
const EMAIL = "priya@example.com";

async function register(email = EMAIL, password = STRONG_PASSWORD) {
  const result = await registerUser({ name: "Priya Sharma", email, password });
  if (!result.ok || result.status !== "verification-required") throw new Error(JSON.stringify(result));
  return result.user;
}

async function createVerifiedUser(email = EMAIL) {
  const { id } = await register(email);
  const verified = await verifyEmailWithToken(await createEmailVerificationToken(id));
  if (!verified.ok) throw new Error("verification failed");
  return (await verifyCredentials(email, STRONG_PASSWORD))!;
}

async function createUserWithTwoFactor() {
  const user = await createVerifiedUser();
  await beginTotpEnrollment(user.id);
  const enrollment = await getPendingTotpEnrollment(user.id);
  if (!enrollment) throw new Error("enrollment missing");
  const confirmed = await confirmTotpEnrollment(user.id, generateTotpCode(enrollment.secret));
  if (!confirmed.ok) throw new Error("enrollment failed");
  return { user, secret: enrollment.secret, recoveryCodes: confirmed.recoveryCodes };
}

const googleProfile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: "google-sub-123",
  email: EMAIL,
  emailVerified: true,
  name: "Priya from Google",
  ...overrides,
});

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("sign-up and email verification", () => {
  it("rejects a weak password", async () => {
    const result = await registerUser({ name: "Priya", email: "p@example.com", password: "password123" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.password?.length).toBeGreaterThan(0);
  });

  it("creates the account unverified; the emailed link verifies it exactly once", async () => {
    const { id } = await register();
    expect((await verifyCredentials(EMAIL, STRONG_PASSWORD))?.emailVerifiedAt).toBeNull();

    const token = await createEmailVerificationToken(id);
    expect(await verifyEmailWithToken(token)).toEqual({ ok: true, email: EMAIL });
    expect(await verifyEmailWithToken(token)).toEqual({ ok: false });
    expect((await verifyCredentials(EMAIL, STRONG_PASSWORD))?.emailVerifiedAt).not.toBeNull();
  });

  it("only the newest verification link works, and links expire", async () => {
    const { id } = await register();
    const first = await createEmailVerificationToken(id);
    const second = await createEmailVerificationToken(id);
    expect(await verifyEmailWithToken(first)).toEqual({ ok: false });

    await prisma.emailVerificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyEmailWithToken(second)).toEqual({ ok: false });
  });

  it("signing up with a verified email changes nothing and reports it to the owner only", async () => {
    await createVerifiedUser();
    const result = await registerUser({ name: "Intruder", email: EMAIL, password: NEW_STRONG_PASSWORD });

    expect(result).toMatchObject({ ok: true, status: "already-registered", user: { hasPassword: true } });
    expect(await verifyCredentials(EMAIL, NEW_STRONG_PASSWORD)).toBeNull();
    expect(await verifyCredentials(EMAIL, STRONG_PASSWORD)).not.toBeNull();
  });

  it("an unverified email can be re-registered: the latest sign-up wins", async () => {
    const { id } = await register(EMAIL, STRONG_PASSWORD);
    const staleLink = await createEmailVerificationToken(id);

    await register(EMAIL, NEW_STRONG_PASSWORD);
    expect(await verifyEmailWithToken(staleLink)).toEqual({ ok: false });
    expect(await verifyCredentials(EMAIL, STRONG_PASSWORD)).toBeNull();
    expect(await verifyCredentials(EMAIL, NEW_STRONG_PASSWORD)).not.toBeNull();
    expect(await findUnverifiedUser(EMAIL)).toMatchObject({ id });
  });

  it("stores an argon2id hash, never the password", async () => {
    await register();
    const row = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("are creds correct?", () => {
  it("accepts the right password and rejects wrong password or unknown email", async () => {
    const user = await createVerifiedUser();
    expect((await verifyCredentials(EMAIL, STRONG_PASSWORD))?.id).toBe(user.id);
    expect(await verifyCredentials(EMAIL, "wrong-password")).toBeNull();
    expect(await verifyCredentials("nobody@example.com", STRONG_PASSWORD)).toBeNull();
  });
});

describe("two-factor enrollment", () => {
  it("only enables 2FA after a valid code and returns 10 recovery codes", async () => {
    const user = await createVerifiedUser();
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

describe("sign-in second factor: authenticator code only", () => {
  it("accepts the current code once, rejects replays, wrong codes and recovery codes", async () => {
    const { user, secret, recoveryCodes } = await createUserWithTwoFactor();
    const code = generateTotpCode(secret, Date.now() + NEXT_STEP_MS);

    expect(await verifyAuthenticatorCode(user.id, code)).toBe(true);
    expect(await verifyAuthenticatorCode(user.id, code)).toBe(false);
    expect(await verifyAuthenticatorCode(user.id, "000000")).toBe(false);
    expect(await verifyAuthenticatorCode(user.id, recoveryCodes[0])).toBe(false);
  });
});

describe("recovery codes only turn 2FA off", () => {
  it("lost authenticator: the code is used, 2FA and all codes are removed", async () => {
    const { user, recoveryCodes } = await createUserWithTwoFactor();

    expect(await disableTwoFactorWithRecoveryCode(user.id, recoveryCodes[0].toUpperCase())).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ totpSecret: null, totpEnabledAt: null });
    expect(await prisma.recoveryCode.count({ where: { userId: user.id } })).toBe(0);
    expect(await disableTwoFactorWithRecoveryCode(user.id, recoveryCodes[1])).toBe(false);
  });

  it("rejects unknown recovery codes and leaves 2FA on", async () => {
    const { user } = await createUserWithTwoFactor();
    expect(await disableTwoFactorWithRecoveryCode(user.id, "aaaa-bbbb-cccc-dddd")).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabledAt).not.toBeNull();
  });

  it("settings accept an authenticator code or a recovery code as proof", async () => {
    const withTotp = await createUserWithTwoFactor();
    expect(await disableTwoFactorWithProof(withTotp.user.id, "000000")).toBe(false);
    expect(
      await disableTwoFactorWithProof(withTotp.user.id, generateTotpCode(withTotp.secret, Date.now() + NEXT_STEP_MS)),
    ).toBe(true);

    await resetDatabase();
    const withRecovery = await createUserWithTwoFactor();
    expect(await disableTwoFactorWithProof(withRecovery.user.id, withRecovery.recoveryCodes[3])).toBe(true);
  });
});

describe("sessions", () => {
  it("a 2FA user is pending after the password step and signed in after the code", async () => {
    const { user } = await createUserWithTwoFactor();
    const { token, session } = await createSession((await verifyCredentials(user.email, STRONG_PASSWORD))!);

    const pending = await validateSessionToken(token);
    expect(pending && authStateOf(pending)).toBe("pending-two-factor");

    await markSessionTwoFactorVerified(session.id);
    const verified = await validateSessionToken(token);
    expect(verified && authStateOf(verified)).toBe("authenticated");
  });

  it("stores only a hash of the session token", async () => {
    const { token, session } = await createSession(await createVerifiedUser());
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
    const { token, session } = await createSession(await createVerifiedUser());
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
    await createVerifiedUser();
    const issued = await createPasswordResetToken(EMAIL);

    expect(await resetPasswordWithToken(issued!.token, "password123")).toMatchObject({
      ok: false,
      reason: "weak-password",
    });
    expect(await findValidPasswordResetToken(issued!.token)).not.toBeNull();
  });

  it("pw strong? YES: changes the password, signs everyone out and burns the link", async () => {
    const user = await createVerifiedUser();
    const { token: sessionToken } = await createSession(user);
    const issued = await createPasswordResetToken(EMAIL);

    expect(await resetPasswordWithToken(issued!.token, NEW_STRONG_PASSWORD)).toMatchObject({ ok: true });
    expect(await validateSessionToken(sessionToken)).toBeNull();
    expect(await verifyCredentials(EMAIL, STRONG_PASSWORD)).toBeNull();
    expect((await verifyCredentials(EMAIL, NEW_STRONG_PASSWORD))?.id).toBe(user.id);
    expect(await resetPasswordWithToken(issued!.token, "another-very-strong-passphrase-99")).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });

  it("completing a reset also verifies the email address", async () => {
    await register();
    const issued = await createPasswordResetToken(EMAIL);
    await resetPasswordWithToken(issued!.token, NEW_STRONG_PASSWORD);
    expect((await verifyCredentials(EMAIL, NEW_STRONG_PASSWORD))?.emailVerifiedAt).not.toBeNull();
  });

  it("only the newest link works, and links expire", async () => {
    await createVerifiedUser();
    const first = await createPasswordResetToken(EMAIL);
    const second = await createPasswordResetToken(EMAIL);
    expect(await findValidPasswordResetToken(first!.token)).toBeNull();

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resetPasswordWithToken(second!.token, NEW_STRONG_PASSWORD)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });
});

describe("Google sign-in", () => {
  it("creates a verified, password-less account and recognises it next time by `sub`", async () => {
    const created = await signInWithGoogle(googleProfile());
    expect(created).toMatchObject({ ok: true, outcome: "created", user: { email: EMAIL, name: "Priya from Google" } });

    const row = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.passwordHash).toBeNull();
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(await verifyCredentials(EMAIL, "")).toBeNull();

    // Even if the Google account's email later changes, the stable id still matches.
    expect(await signInWithGoogle(googleProfile({ email: "renamed@example.com" }))).toMatchObject({
      ok: true,
      outcome: "signed-in",
      user: { id: row.id },
    });
  });

  it("links to an existing verified account and keeps its password and 2FA", async () => {
    const { user } = await createUserWithTwoFactor();
    const result = await signInWithGoogle(googleProfile({ email: "PRIYA@example.com" }));

    expect(result).toMatchObject({ ok: true, outcome: "linked", user: { id: user.id } });
    expect(result.ok && result.user.totpEnabledAt).not.toBeNull();
    expect(await verifyCredentials(EMAIL, STRONG_PASSWORD)).not.toBeNull();
  });

  it("takes over an unverified account safely: its unproven password and sessions are removed", async () => {
    const squatter = await register(EMAIL, NEW_STRONG_PASSWORD);
    await createSession({ id: squatter.id, totpEnabledAt: null });

    expect(await signInWithGoogle(googleProfile())).toMatchObject({ ok: true, outcome: "linked" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
    expect(row.passwordHash).toBeNull();
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: squatter.id } })).toBe(0);
  });

  it("refuses unverified Google emails and a second Google account for the same user", async () => {
    expect(await signInWithGoogle(googleProfile({ emailVerified: false }))).toEqual({
      ok: false,
      reason: "email-unverified",
    });

    await signInWithGoogle(googleProfile());
    expect(await signInWithGoogle(googleProfile({ sub: "another-google-account" }))).toEqual({
      ok: false,
      reason: "already-linked",
    });
  });
});

describe("rate limits (stored in PostgreSQL)", () => {
  it("allows `limit` hits per window, then blocks until the window ends", async () => {
    for (let hit = 0; hit < 3; hit++) expect(await rateLimit("test:key", 3, 60_000)).toEqual({ ok: true });
    const blocked = await rateLimit("test:key", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.retryAfterSeconds).toBeGreaterThan(0);

    await prisma.rateLimit.update({ where: { key: "test:key" }, data: { resetAt: new Date(Date.now() - 1) } });
    expect(await rateLimit("test:key", 3, 60_000)).toEqual({ ok: true });

    await clearRateLimit("test:key");
    expect(await prisma.rateLimit.count()).toBe(0);
  });

  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit("test:burst", 5, 60_000)));
    expect(results.filter((result) => result.ok)).toHaveLength(5);
  });
});
