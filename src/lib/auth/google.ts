import "server-only";
import * as oidc from "openid-client";
import { env } from "@/lib/env";
import type { GoogleProfile } from "@/lib/auth/google-accounts";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
/** Short-lived cookie holding the state/nonce/PKCE verifier between redirect and callback. */
export const GOOGLE_STATE_COOKIE = "google_oauth";

export type GoogleAuthorizationChecks = { state: string; nonce: string; codeVerifier: string };

export function isGoogleSignInEnabled(): boolean {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/** Must match an "Authorized redirect URI" in the Google Cloud console exactly. */
export function googleRedirectUri(): string {
  return new URL(GOOGLE_CALLBACK_PATH, env().APP_URL).toString();
}

let configuration: Promise<oidc.Configuration> | undefined;

function getConfiguration(): Promise<oidc.Configuration> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return Promise.reject(new Error("Google sign-in is not configured"));
  }
  configuration ??= oidc.discovery(GOOGLE_ISSUER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).catch((error) => {
    configuration = undefined;
    throw error;
  });
  return configuration;
}

/** Authorization Code flow with PKCE, state and nonce. */
export async function createGoogleAuthorizationUrl(): Promise<{ url: URL; checks: GoogleAuthorizationChecks }> {
  const config = await getConfiguration();
  const checks: GoogleAuthorizationChecks = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(),
    scope: "openid email profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
    code_challenge_method: "S256",
    state: checks.state,
    nonce: checks.nonce,
    prompt: "select_account",
  });
  return { url, checks };
}

/**
 * Exchanges the code and validates the ID token (issuer, audience, expiry, nonce).
 * The callback URL is rebuilt from APP_URL so it matches the registered redirect URI even
 * behind a reverse proxy.
 */
export async function completeGoogleAuthorization(
  callbackSearch: string,
  checks: GoogleAuthorizationChecks,
): Promise<GoogleProfile> {
  const config = await getConfiguration();
  const callbackUrl = new URL(googleRedirectUri());
  callbackUrl.search = callbackSearch;

  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("Google did not return an ID token");

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
