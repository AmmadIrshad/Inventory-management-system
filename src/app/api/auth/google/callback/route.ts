import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { decrypt } from "@/lib/crypto";
import { googleLinkedMessage, sendEmailInBackground } from "@/lib/emails";
import { getRequestMeta } from "@/lib/request";
import { getSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import {
  completeGoogleAuthorization,
  GOOGLE_STATE_COOKIE,
  type GoogleAuthorizationChecks,
} from "@/lib/auth/google";
import { signInWithGoogle, type GoogleProfile } from "@/lib/auth/google-accounts";
import { createSession, invalidateSessionToken } from "@/lib/auth/session";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, env().APP_URL));
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  cookieStore.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });

  // The user pressed "Cancel" on Google's consent screen.
  if (request.nextUrl.searchParams.has("error")) return redirectTo("/login?error=google-cancelled");
  if (!stored) return redirectTo("/login?error=google-failed");

  let profile: GoogleProfile;
  try {
    const checks = JSON.parse(decrypt(stored)) as GoogleAuthorizationChecks;
    profile = await completeGoogleAuthorization(request.nextUrl.search, checks);
  } catch (error) {
    console.error("[google] callback rejected", error);
    return redirectTo("/login?error=google-failed");
  }

  const result = await signInWithGoogle(profile);
  if (!result.ok) return redirectTo(`/login?error=google-${result.reason}`);

  if (result.outcome === "linked") {
    sendEmailInBackground(result.user.email, googleLinkedMessage(result.user.name));
  }

  const previousToken = await getSessionToken();
  if (previousToken) await invalidateSessionToken(previousToken);
  const { token } = await createSession(result.user, await getRequestMeta());
  await setSessionCookie(token);

  // Google proves the email, not the second factor: 2FA users still enter their code.
  if (result.user.totpEnabledAt) return redirectTo("/login/two-factor");
  return redirectTo(result.outcome === "created" ? "/settings/security?welcome=1" : "/");
}
