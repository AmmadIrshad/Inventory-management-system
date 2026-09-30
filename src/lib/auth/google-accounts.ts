import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";

export const GOOGLE_PROVIDER = "google";

export type GoogleProfile = {
  /** Google's stable account id. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type GoogleSignInResult =
  | { ok: true; user: SessionUser; outcome: "signed-in" | "linked" | "created" }
  | { ok: false; reason: "email-unverified" | "already-linked" };

const userSelect = { id: true, email: true, name: true, totpEnabledAt: true } as const;

/**
 * Finds or creates the account for a Google identity. Existing accounts are linked by email
 * only because Google has verified that address. If the local account was never verified,
 * whoever created it never proved they own the address, so its password is removed.
 */
export async function signInWithGoogle(profile: GoogleProfile): Promise<GoogleSignInResult> {
  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: profile.sub } },
    select: { user: { select: userSelect } },
  });
  if (account) return { ok: true, user: account.user, outcome: "signed-in" };

  if (!profile.email || !profile.emailVerified) return { ok: false, reason: "email-unverified" };
  const email = profile.email.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        ...userSelect,
        emailVerifiedAt: true,
        oauthAccounts: { where: { provider: GOOGLE_PROVIDER }, select: { id: true } },
      },
    });

    if (existing) {
      // A different Google account is already connected to this user.
      if (existing.oauthAccounts.length > 0) return { ok: false, reason: "already-linked" };

      await prisma.$transaction(async (tx) => {
        await tx.oAuthAccount.create({
          data: { userId: existing.id, provider: GOOGLE_PROVIDER, providerAccountId: profile.sub },
        });
        if (!existing.emailVerifiedAt) {
          await tx.user.update({
            where: { id: existing.id },
            data: { emailVerifiedAt: new Date(), passwordHash: null },
          });
          await tx.session.deleteMany({ where: { userId: existing.id } });
          await tx.emailVerificationToken.deleteMany({ where: { userId: existing.id } });
        }
      });
      const { id, name, totpEnabledAt } = existing;
      return { ok: true, user: { id, email, name, totpEnabledAt }, outcome: "linked" };
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: profile.name?.trim().slice(0, 100) || email.split("@")[0],
        emailVerifiedAt: new Date(),
        oauthAccounts: { create: { provider: GOOGLE_PROVIDER, providerAccountId: profile.sub } },
      },
      select: userSelect,
    });
    return { ok: true, user, outcome: "created" };
  } catch (error) {
    // A parallel first sign-in created the rows first; the retry will find them.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return signInWithGoogle(profile);
    }
    throw error;
  }
}
