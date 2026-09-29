import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_MS, shouldUseSecureCookies } from "@/lib/auth/constants";

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  // The cookie always lives as long as a full session; the database decides whether the
  // session is still pending 2FA or already expired.
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function deleteSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
