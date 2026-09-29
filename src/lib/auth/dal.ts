import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/auth/cookies";
import { authStateOf, validateSessionToken, type SessionWithUser } from "@/lib/auth/session";

/** The current session (memoized per request), or null. */
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const token = await getSessionToken();
  return token ? validateSessionToken(token) : null;
});

/** Fully signed-in user (password + second factor when enabled). */
export async function requireUser(): Promise<SessionWithUser> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (authStateOf(current) === "pending-two-factor") redirect("/login/two-factor");
  return current;
}

/** A session that passed the password step and still owes a second factor. */
export async function requirePendingTwoFactor(): Promise<SessionWithUser> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (authStateOf(current) === "authenticated") redirect("/");
  return current;
}

/** For login/signup pages: send already signed-in visitors where they belong. */
export async function redirectIfSignedIn(): Promise<void> {
  const current = await getCurrentSession();
  if (!current) return;
  redirect(authStateOf(current) === "authenticated" ? "/" : "/login/two-factor");
}
