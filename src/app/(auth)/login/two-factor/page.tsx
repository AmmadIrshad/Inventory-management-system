import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { requirePendingTwoFactor } from "@/lib/auth/dal";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function TwoFactorPage() {
  const { user } = await requirePendingTwoFactor();

  return (
    <AuthCard
      title="Two-factor authentication"
      description={
        <>
          Open your authenticator app and enter the 6-digit code for{" "}
          <span className="font-medium text-gray-900">{user.email}</span>.
        </>
      }
      footer={
        <form action={logout} className="inline">
          <button type="submit" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in with a different account
          </button>
        </form>
      }
    >
      <TwoFactorForm />
      <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600">
        Lost your authenticator app?{" "}
        <Link href="/login/recovery" className="font-semibold text-indigo-600 hover:text-indigo-500">
          Use a recovery code
        </Link>
      </p>
    </AuthCard>
  );
}
