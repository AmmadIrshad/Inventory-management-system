import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { findValidEmailVerificationToken } from "@/lib/auth/email-verification";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Verify your email", referrer: "no-referrer" };

// Opening the link only shows a button; verification happens on POST. Mail scanners that
// pre-fetch links therefore can't verify an address on the owner's behalf.
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const verificationToken = typeof token === "string" ? token : "";
  const pending = verificationToken ? await findValidEmailVerificationToken(verificationToken) : null;

  if (!pending) {
    return (
      <AuthCard
        title="This link has expired"
        description="Verification links work once and expire after 24 hours. If your email is already verified, just sign in. Otherwise, request a new link."
      >
        <ResendVerificationForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verify your email"
      description={
        <>
          Confirm that <span className="font-medium text-gray-900">{pending.email}</span> is your email
          address to activate your account.
        </>
      }
    >
      <VerifyEmailForm token={verificationToken} />
    </AuthCard>
  );
}
