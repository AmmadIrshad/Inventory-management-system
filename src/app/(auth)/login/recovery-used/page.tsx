import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { removeTwoFactorAfterRecovery } from "@/app/actions/two-factor";
import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth/dal";
import { countRemainingRecoveryCodes } from "@/lib/auth/two-factor";

export const metadata: Metadata = { title: "Recovery code used" };

export default async function RecoveryUsedPage() {
  const { user } = await requireUser();
  if (!user.totpEnabledAt) redirect("/");
  const remaining = await countRemainingRecoveryCodes(user.id);

  return (
    <AuthCard
      title="You signed in with a recovery code"
      description="That code has been marked as used and won't work again."
    >
      <div className="space-y-5">
        <Alert variant={remaining <= 2 ? "warning" : "info"}>
          You have <strong>{remaining}</strong> unused recovery {remaining === 1 ? "code" : "codes"} left.
          {remaining <= 2 && " Generate new ones from Security settings soon."}
        </Alert>
        <p className="text-sm leading-6 text-gray-700">
          If you no longer have your authenticator app, you can remove two-factor authentication
          now and set it up again on your new device.
        </p>
        <p className="text-sm font-semibold text-gray-900">Do you want to remove two-factor authentication?</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={removeTwoFactorAfterRecovery}>
            <SubmitButton variant="danger" pendingText="Removing…">
              Yes, remove 2FA
            </SubmitButton>
          </form>
          <Link href="/" className={buttonClass("secondary")}>
            No, keep 2FA
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
