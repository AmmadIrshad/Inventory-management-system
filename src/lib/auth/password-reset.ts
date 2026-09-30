import "server-only";
import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { checkPasswordStrength } from "@/lib/password-strength";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/auth/constants";

/**
 * Issues a single-use reset token for `email`. Returns null when no account exists; callers
 * must respond identically either way so the form can't be used to discover accounts.
 */
export async function createPasswordResetToken(
  email: string,
): Promise<{ token: string; user: { email: string; name: string } } | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (!user) return null;

  const token = generateToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        id: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);
  return { token, user: { email: user.email, name: user.name } };
}

/** The account a still-usable token belongs to, or null. */
export async function findValidPasswordResetToken(
  token: string,
): Promise<{ userId: string; email: string; name: string } | null> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) return null;
  return { userId: record.userId, email: record.user.email, name: record.user.name };
}

export type ResetPasswordResult =
  | { ok: true; user: { email: string; name: string } }
  | { ok: false; reason: "invalid-token" }
  | { ok: false; reason: "weak-password"; problems: string[] };

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const owner = await findValidPasswordResetToken(token);
  if (!owner) return { ok: false, reason: "invalid-token" };

  const strength = checkPasswordStrength(newPassword, [owner.name, owner.email]);
  if (!strength.isStrong) return { ok: false, reason: "weak-password", problems: strength.problems };

  const passwordHash = await hashPassword(newPassword);
  const tokenId = sha256(token);

  return prisma.$transaction(async (tx) => {
    // Claim the token atomically so two concurrent submissions can't both succeed.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: tokenId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count !== 1) return { ok: false, reason: "invalid-token" } as const;

    await tx.user.update({ where: { id: owner.userId }, data: { passwordHash } });
    // Opening the emailed link also proves the address belongs to this person.
    await tx.user.updateMany({
      where: { id: owner.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: owner.userId, id: { not: tokenId } } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: owner.userId } });
    // Everyone signed in with the old password is signed out.
    await tx.session.deleteMany({ where: { userId: owner.userId } });
    return { ok: true, user: { email: owner.email, name: owner.name } } as const;
  });
}
