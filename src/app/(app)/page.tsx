import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { user } = await requireUser();
  const { notice } = await searchParams;

  return (
    <div className="space-y-8">
      {notice === "two-factor-removed" && (
        <Alert variant="warning">
          Two-factor authentication has been removed from your account.{" "}
          <Link href="/settings/security" className="font-semibold underline">
            Set it up again on your new device
          </Link>
          .
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user.email}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Account security</h2>
          {user.totpEnabledAt ? (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              <span className="font-medium text-emerald-700">Two-factor authentication is on.</span>{" "}
              Your account needs your password and your authenticator app to sign in.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              <span className="font-medium text-amber-700">Two-factor authentication is off.</span>{" "}
              Anyone with your password can sign in.
            </p>
          )}
          <Link
            href="/settings/security"
            className={buttonClass(user.totpEnabledAt ? "secondary" : "primary", "mt-4")}
          >
            {user.totpEnabledAt ? "Manage security" : "Turn on 2FA"}
          </Link>
        </section>

        <section className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-6">
          <h2 className="font-semibold">Inventory</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Products, stock levels, suppliers and purchase orders arrive in phase two.
          </p>
        </section>
      </div>
    </div>
  );
}
