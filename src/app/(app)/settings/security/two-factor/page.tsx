import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { cancelTwoFactorSetup } from "@/app/actions/two-factor";
import { requireUser } from "@/lib/auth/dal";
import { getPendingTotpEnrollment } from "@/lib/auth/two-factor";
import { ConfirmTwoFactorForm } from "./confirm-two-factor-form";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function TwoFactorSetupPage() {
  const { user } = await requireUser();
  const enrollment = user.totpEnabledAt ? null : await getPendingTotpEnrollment(user.id);
  if (!enrollment) redirect("/settings/security");

  const qrCode = await QRCode.toDataURL(enrollment.keyUri, { margin: 1, width: 220 });
  const manualKey = enrollment.secret.match(/.{1,4}/g)!.join(" ");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up two-factor authentication</h1>
        <p className="mt-1 text-sm text-gray-600">Two quick steps with the authenticator app on your phone.</p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold">1. Scan this QR code</h2>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated per request */}
          <img
            src={qrCode}
            alt="QR code for your authenticator app"
            width={220}
            height={220}
            className="rounded-lg border border-gray-200"
          />
          <div className="space-y-2 text-sm text-gray-600">
            <p>Can&apos;t scan it? Add an account manually with this setup key:</p>
            <code className="block rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm break-all text-gray-900 select-all">
              {manualKey}
            </code>
            <p className="text-xs">Time-based, 6 digits, 30 seconds.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold">2. Enter the 6-digit code from the app</h2>
        <div className="mt-4">
          <ConfirmTwoFactorForm />
        </div>
      </section>

      <form action={cancelTwoFactorSetup}>
        <button type="submit" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          Cancel setup
        </button>
      </form>
    </div>
  );
}
