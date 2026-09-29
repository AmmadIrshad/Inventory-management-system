import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { checkPasswordStrength } from "@/lib/password-strength";
import type { SessionUser } from "@/lib/auth/session";

type FieldErrors = Partial<Record<"name" | "email" | "password", string[]>>;

export type RegisterResult =
  | { ok: true; user: SessionUser }
  | { ok: false; fieldErrors: FieldErrors };

const EMAIL_TAKEN = "An account with this email already exists. Try signing in instead.";

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const strength = checkPasswordStrength(input.password, [input.name, input.email]);
  if (!strength.isStrong) {
    return { ok: false, fieldErrors: { password: strength.problems } };
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) return { ok: false, fieldErrors: { email: [EMAIL_TAKEN] } };

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true, email: true, name: true, totpEnabledAt: true },
    });
    return { ok: true, user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fieldErrors: { email: [EMAIL_TAKEN] } };
    }
    throw error;
  }
}

/** Returns the user when the email/password pair is correct, otherwise null. */
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, totpEnabledAt: true, passwordHash: true },
  });

  if (!user) {
    await verifyAgainstDummyHash(password);
    return null;
  }

  const { passwordHash, ...publicUser } = user;
  return (await verifyPassword(passwordHash, password)) ? publicUser : null;
}

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return user ? verifyPassword(user.passwordHash, password) : false;
}
