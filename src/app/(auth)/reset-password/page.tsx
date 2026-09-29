import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { buttonClass } from "@/components/ui/button";
import { findValidPasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const resetToken = typeof token === "string" ? token : "";
  const owner = resetToken ? await findValidPasswordResetToken(resetToken) : null;

  if (!owner) {
    return (
      <AuthCard
        title="This link has expired"
        description="Password reset links work once and expire after 30 minutes. Request a new one to continue."
      >
        <Link href="/forgot-password" className={buttonClass("primary", "w-full")}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description={
        <>
          For <span className="font-medium text-gray-900">{owner.email}</span>. You&apos;ll be signed
          out everywhere and asked to sign in again.
        </>
      }
    >
      <ResetPasswordForm token={resetToken} userInputs={[owner.name, owner.email]} />
    </AuthCard>
  );
}
