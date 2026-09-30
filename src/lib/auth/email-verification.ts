import "server-only";
import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";
import { EMAIL_VERIFICATION_TTL_HOURS } from "@/lib/auth/constants";

/** Issues a fresh single-use link token; older links for the user stop working. */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({
      data: {
        id: sha256(token),
        userId,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
    }),
  ]);
  return token;
}

export async function findValidEmailVerificationToken(token: string): Promise<{ email: string } | null> {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { email: true } } },
  });
  if (!record || record.expiresAt.getTime() <= Date.now()) return null;
  return { email: record.user.email };
}

export async function verifyEmailWithToken(token: string): Promise<{ ok: true; email: string } | { ok: false }> {
  const tokenId = sha256(token);
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({
      where: { id: tokenId },
      select: { userId: true, expiresAt: true },
    });
    if (!record || record.expiresAt.getTime() <= Date.now()) return { ok: false } as const;

    // Deleting first makes the token single-use even with concurrent clicks.
    const { count } = await tx.emailVerificationToken.deleteMany({ where: { id: tokenId } });
    if (count !== 1) return { ok: false } as const;

    const user = await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
      select: { email: true },
    });
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    return { ok: true, email: user.email } as const;
  });
}

export async function findUnverifiedUser(email: string): Promise<{ id: string; name: string } | null> {
  return prisma.user.findFirst({
    where: { email, emailVerifiedAt: null },
    select: { id: true, name: true },
  });
}
