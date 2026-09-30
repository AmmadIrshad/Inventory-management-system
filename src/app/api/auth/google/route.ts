import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { shouldUseSecureCookies } from "@/lib/auth/constants";
import {
  createGoogleAuthorizationUrl,
  GOOGLE_STATE_COOKIE,
  isGoogleSignInEnabled,
} from "@/lib/auth/google";

export async function GET() {
  if (!isGoogleSignInEnabled()) {
    return NextResponse.redirect(new URL("/login?error=google-unavailable", env().APP_URL));
  }

  try {
    const { url, checks } = await createGoogleAuthorizationUrl();
    (await cookies()).set(GOOGLE_STATE_COOKIE, encrypt(JSON.stringify(checks)), {
      httpOnly: true,
      // Lax is required: the callback is a top-level navigation coming back from Google.
      sameSite: "lax",
      secure: shouldUseSecureCookies(),
      path: "/api/auth/google",
      maxAge: 10 * 60,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[google] could not start sign-in", error);
    return NextResponse.redirect(new URL("/login?error=google-failed", env().APP_URL));
  }
}
