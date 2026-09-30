import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { checkPasswordStrength } from "@/lib/password-strength";
import type { SessionUser } from "@/lib/auth/session";

type FieldErrors = Partial<Record<"name" | "email" | "password", string[]>>;

export type RegisterResult =
  | { ok: false; fieldErrors: FieldErrors }
  /** New (or still unverified) account: send a verification link. */
  | { ok: true; status: "verification-required"; user: { id: string; email: string; name: string } }
  /** The email already belongs to a verified account: tell its owner, not the visitor. */
  | { ok: true; status: "already-registered"; user: { id: string; email: string; name: string; hasPassword: boolean } };

const userSelect = { id: true, email: true, name: true, totpEnabledAt: true } as const;

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const strength = checkPasswordStrength(input.password, [input.name, input.email]);
  if (!strength.isStrong) {
    return { ok: false, fieldErrors: { password: strength.problems } };
  }

  // Hash before looking the email up so both outcomes take the same time.
  const passwordHash = await hashPassword(input.password);
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true, passwordHash: true },
  });

  if (existing?.emailVerifiedAt) {
    const { id, email, name } = existing;
    return {
      ok: true,
      status: "already-registered",
      user: { id, email, name, hasPassword: existing.passwordHash !== null },
    };
  }

  if (existing) {
    // Nobody has proven they own this address yet, so the latest sign-up wins. This stops an
    // attacker from pre-registering someone else's email with a password they know.
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { name: input.name, passwordHash },
      select: { id: true, email: true, name: true },
    });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    return { ok: true, status: "verification-required", user };
  }

  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: { id: true, email: true, name: true },
    });
    return { ok: true, status: "verification-required", user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return registerUser(input);
    }
    throw error;
  }
}

export type CredentialsUser = SessionUser & { emailVerifiedAt: Date | null };

/** Returns the user when the email/password pair is correct, otherwise null. */
export async function verifyCredentials(email: string, password: string): Promise<CredentialsUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...userSelect, emailVerifiedAt: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    await verifyAgainstDummyHash(password);
    return null;
  }

  const { passwordHash, ...publicUser } = user;
  return (await verifyPassword(passwordHash, password)) ? publicUser : null;
}

export async function getSignInMethods(userId: string): Promise<{ hasPassword: boolean; google: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true, oauthAccounts: { select: { provider: true } } },
  });
  return {
    hasPassword: user.passwordHash !== null,
    google: user.oauthAccounts.some((account) => account.provider === "google"),
  };
}
