import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui/alert";
import { requirePendingTwoFactor } from "@/lib/auth/dal";
import { RecoveryCodeForm } from "./recovery-code-form";

export const metadata: Metadata = { title: "Use a recovery code" };

export default async function RecoveryPage() {
  const { user } = await requirePendingTwoFactor();

  return (
    <AuthCard
      title="Lost your authenticator app?"
      description={
        <>
          Enter one of the recovery codes you saved for{" "}
          <span className="font-medium text-gray-900">{user.email}</span>.
        </>
      }
      footer={
        <Link href="/login/two-factor" className="font-semibold text-indigo-600 hover:text-indigo-500">
          ← Back to authenticator code
        </Link>
      }
    >
      <div className="space-y-5">
        <Alert variant="warning">
          A recovery code <strong>turns off two-factor authentication</strong>. The code is marked as
          used, 2FA is removed, and you&apos;re signed in. Set 2FA up again on your new phone
          afterwards.
        </Alert>
        <RecoveryCodeForm />
      </div>
    </AuthCard>
  );
}
