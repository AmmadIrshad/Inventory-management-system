import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { Alert, type AlertVariant } from "@/components/ui/alert";
import { redirectIfSignedIn } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const messages: Record<string, { variant: AlertVariant; text: string }> = {
  "password-reset": { variant: "success", text: "Your password has been changed. Sign in with your new password." },
  "too-many-attempts": { variant: "error", text: "Too many incorrect codes. Sign in again to get new attempts." },
  "session-expired": { variant: "warning", text: "Your sign-in took too long. Please sign in again." },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await redirectIfSignedIn();
  const { notice, error } = await searchParams;
  const key = typeof notice === "string" ? notice : typeof error === "string" ? error : undefined;
  const message = key ? messages[key] : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Enter your email and password to continue."
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
      <LoginForm />
    </AuthCard>
  );
}
