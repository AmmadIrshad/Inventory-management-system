import "server-only";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  generateTotpSecret,
  isTotpCodeFormat,
  totpKeyUri,
  verifyTotpCode,
} from "@/lib/totp";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeFormat,
} from "@/lib/recovery-codes";

function stripSpaces(input: string): string {
  return input.replace(/\s+/g, "");
}

/**
 * Checks a TOTP code and records its time-step so the same code can't be used twice.
 * Pass `pendingEnrollment` to check against a secret that isn't enabled yet.
 */
async function consumeTotpCode(
  userId: string,
  code: string,
  { pendingEnrollment = false } = {},
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret) return false;
  if (pendingEnrollment !== (user.totpEnabledAt === null)) return false;

  const step = verifyTotpCode(decrypt(user.totpSecret), code);
  if (step === null) return false;

  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
    },
    data: { totpLastUsedStep: step },
  });
  return count === 1;
}

async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  // updateMany with `usedAt: null` makes "check and mark as used" a single atomic statement.
  const { count } = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

export function countRemainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}

/** The sign-in second factor: only a code from the authenticator app is accepted. */
export async function verifyAuthenticatorCode(userId: string, input: string): Promise<boolean> {
  const code = stripSpaces(input);
  return isTotpCodeFormat(code) && consumeTotpCode(userId, code);
}

/**
 * Recovery codes have one purpose: turning 2FA off when the authenticator is lost.
 * The code is marked as used, then 2FA (and every remaining code) is removed.
 */
export async function disableTwoFactorWithRecoveryCode(userId: string, input: string): Promise<boolean> {
  if (!isRecoveryCodeFormat(input) || !(await consumeRecoveryCode(userId, input))) return false;
  await disableTwoFactor(userId);
  return true;
}

/** Turning 2FA off from settings: proof is a current authenticator code or a recovery code. */
export async function disableTwoFactorWithProof(userId: string, input: string): Promise<boolean> {
  const code = stripSpaces(input);
  if (isTotpCodeFormat(code)) {
    if (!(await consumeTotpCode(userId, code))) return false;
    await disableTwoFactor(userId);
    return true;
  }
  return disableTwoFactorWithRecoveryCode(userId, code);
}

/** Creates (or keeps) a not-yet-confirmed TOTP secret. */
export async function beginTotpEnrollment(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (user.totpEnabledAt || user.totpSecret) return;

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encrypt(generateTotpSecret()), totpLastUsedStep: null },
  });
}

export async function getPendingTotpEnrollment(
  userId: string,
): Promise<{ secret: string; keyUri: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret || user.totpEnabledAt) return null;

  const secret = decrypt(user.totpSecret);
  return { secret, keyUri: totpKeyUri(secret, user.email) };
}

export async function cancelTotpEnrollment(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, totpEnabledAt: null },
    data: { totpSecret: null, totpLastUsedStep: null },
  });
}

/** Confirms enrollment with a code from the app. Returns the one-time-visible recovery codes. */
export async function confirmTotpEnrollment(
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const normalized = stripSpaces(code);
  if (!isTotpCodeFormat(normalized)) return { ok: false };
  if (!(await consumeTotpCode(userId, normalized, { pendingEnrollment: true }))) return { ok: false };

  const recoveryCodes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({ userId, codeHash: hashRecoveryCode(recoveryCode) })),
    }),
  ]);
  return { ok: true, recoveryCodes };
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const recoveryCodes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({ userId, codeHash: hashRecoveryCode(recoveryCode) })),
    }),
  ]);
  return recoveryCodes;
}

export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastUsedStep: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}
