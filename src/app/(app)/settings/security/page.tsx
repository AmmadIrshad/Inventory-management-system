import type { Metadata } from "next";
import Link from "next/link";
import { startTwoFactorSetup } from "@/app/actions/two-factor";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth/dal";
import { countRemainingRecoveryCodes, getPendingTotpEnrollment } from "@/lib/auth/two-factor";
import { RECOVERY_CODE_COUNT } from "@/lib/recovery-codes";
import { DisableTwoFactorForm } from "./disable-two-factor-form";
import { RegenerateCodesForm } from "./regenerate-codes-form";

export const metadata: Metadata = { title: "Security" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long" });

export default async function SecuritySettingsPage({ searchParams }: PageProps<"/settings/security">) {
  const { user } = await requireUser();
  const { welcome, disabled } = await searchParams;
  const enabled = user.totpEnabledAt !== null;
  const [remaining, pendingEnrollment] = await Promise.all([
    enabled ? countRemainingRecoveryCodes(user.id) : Promise.resolve(0),
    enabled ? Promise.resolve(null) : getPendingTotpEnrollment(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="mt-1 text-sm text-gray-600">Manage how you sign in to Inventory.</p>
      </div>

      {welcome === "1" && !enabled && (
        <Alert variant="info">
          Your account is ready. Take a minute to turn on two-factor authentication, or{" "}
          <Link href="/" className="font-semibold underline">
            skip for now
          </Link>
          .
        </Alert>
      )}
      {disabled === "1" && (
        <Alert variant="warning">Two-factor authentication is now off and other devices were signed out.</Alert>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Two-factor authentication</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Require a code from an authenticator app (Google Authenticator, Microsoft
              Authenticator, 1Password, Aegis…) every time you sign in.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              enabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
            }`}
          >
            {enabled ? "On" : "Off"}
          </span>
        </div>

        {enabled ? (
          <p className="mt-4 text-sm text-gray-600">
            Enabled on {dateFormat.format(user.totpEnabledAt!)}.
          </p>
        ) : (
          <form action={startTwoFactorSetup} className="mt-5">
            <SubmitButton>{pendingEnrollment ? "Continue setup" : "Set up authenticator app"}</SubmitButton>
          </form>
        )}
      </section>

      {enabled && (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Recovery codes</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              <strong className={remaining <= 2 ? "text-amber-700" : "text-gray-900"}>
                {remaining} of {RECOVERY_CODE_COUNT}
              </strong>{" "}
              unused. Generating new codes replaces all of the old ones.
            </p>
            <div className="mt-5">
              <RegenerateCodesForm />
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-red-800">Turn off two-factor authentication</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Your account will be protected by your password only. Confirm with your password.
            </p>
            <div className="mt-5">
              <DisableTwoFactorForm />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
