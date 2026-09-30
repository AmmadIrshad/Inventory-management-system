import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Alert, type AlertVariant } from "@/components/ui/alert";
import { redirectIfSignedIn } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const messages: Record<string, { variant: AlertVariant; text: string }> = {
  "email-verified": { variant: "success", text: "Your email is verified. Sign in to continue." },
  "password-reset": { variant: "success", text: "Your password has been changed. Sign in with your new password." },
  "too-many-attempts": { variant: "error", text: "Too many incorrect codes. Sign in again to get new attempts." },
  "session-expired": { variant: "warning", text: "Your sign-in took too long. Please sign in again." },
  "google-cancelled": { variant: "warning", text: "Google sign-in was cancelled." },
  "google-failed": { variant: "error", text: "Google sign-in didn't complete. Please try again." },
  "google-unavailable": { variant: "error", text: "Google sign-in isn't set up on this server." },
  "google-email-unverified": {
    variant: "error",
    text: "Your Google account's email address isn't verified, so it can't be used to sign in.",
  },
  "google-already-linked": {
    variant: "error",
    text: "A different Google account is already connected to this email. Sign in with that one or with your password.",
  },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await redirectIfSignedIn();
  const { notice, error } = await searchParams;
  const key = typeof notice === "string" ? notice : typeof error === "string" ? error : undefined;
  const message = key ? messages[key] : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to continue."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Create an account
          </Link>
        </>
      }
    >
      {message && (
        <div className="mb-5">
          <Alert variant={message.variant}>{message.text}</Alert>
        </div>
      )}
      <GoogleSignIn />
      <LoginForm />
    </AuthCard>
  );
}
