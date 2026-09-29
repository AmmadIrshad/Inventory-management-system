import "server-only";
import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";
import {
  MAX_TWO_FACTOR_ATTEMPTS,
  PENDING_TWO_FACTOR_TTL_MS,
  SESSION_RENEW_THRESHOLD_MS,
  SESSION_TTL_MS,
} from "@/lib/auth/constants";

/** Fields that are safe to hand to pages and components. */
const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  totpEnabledAt: true,
} as const;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  totpEnabledAt: Date | null;
};

export type Session = {
  id: string;
  userId: string;
  twoFactorVerified: boolean;
  twoFactorAttempts: number;
  expiresAt: Date;
  createdAt: Date;
};

export type SessionWithUser = { session: Session; user: SessionUser };

export type AuthState = "pending-two-factor" | "authenticated";

export function authStateOf({ session, user }: SessionWithUser): AuthState {
  return user.totpEnabledAt && !session.twoFactorVerified ? "pending-two-factor" : "authenticated";
}

export async function createSession(
  user: Pick<SessionUser, "id" | "totpEnabledAt">,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; session: Session }> {
  const token = generateToken();
  const pending = user.totpEnabledAt !== null;
  const session = await prisma.session.create({
    data: {
      id: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + (pending ? PENDING_TWO_FACTOR_TTL_MS : SESSION_TTL_MS)),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, session };
}

export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
  const id = sha256(token);
  const row = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: publicUserSelect } },
    omit: { ipAddress: true, userAgent: true },
  });
  if (!row) return null;

  const { user, ...session } = row;
  const now = Date.now();

  if (now >= session.expiresAt.getTime()) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  const result = { session, user };
  if (
    authStateOf(result) === "authenticated" &&
    session.expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS
  ) {
    session.expiresAt = new Date(now + SESSION_TTL_MS);
    await prisma.session.update({ where: { id }, data: { expiresAt: session.expiresAt } });
  }

  return result;
}

export async function markSessionTwoFactorVerified(sessionId: string): Promise<Session> {
  return prisma.session.update({
    where: { id: sessionId },
    data: {
      twoFactorVerified: true,
      twoFactorAttempts: 0,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
    omit: { ipAddress: true, userAgent: true },
  });
}

/** Counts a wrong code. Returns attempts left; at zero the session is deleted. */
export async function recordFailedTwoFactorAttempt(sessionId: string): Promise<number> {
  const { twoFactorAttempts } = await prisma.session.update({
    where: { id: sessionId },
    data: { twoFactorAttempts: { increment: 1 } },
    select: { twoFactorAttempts: true },
  });
  const remaining = MAX_TWO_FACTOR_ATTEMPTS - twoFactorAttempts;
  if (remaining <= 0) await invalidateSession(sessionId);
  return Math.max(remaining, 0);
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateSessionToken(token: string): Promise<void> {
  await invalidateSession(sha256(token));
}

export async function invalidateUserSessions(
  userId: string,
  options: { exceptSessionId?: string } = {},
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
  });
}
