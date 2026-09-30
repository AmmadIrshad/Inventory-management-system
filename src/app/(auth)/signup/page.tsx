import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { GoogleSignIn } from "@/components/google-sign-in";
import { redirectIfSignedIn } from "@/lib/auth/dal";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  await redirectIfSignedIn();

  return (
    <AuthCard
      title="Create your account"
      description="We'll email you a link to confirm your address before you can sign in."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignIn />
      <SignupForm />
    </AuthCard>
  );
}
