"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmTwoFactorSetup, type RecoveryCodesFormState } from "@/app/actions/two-factor";
import { RecoveryCodesPanel } from "@/components/recovery-codes-panel";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ConfirmTwoFactorForm() {
  const [state, action] = useActionState<RecoveryCodesFormState, FormData>(confirmTwoFactorSetup, {});

  if (state.recoveryCodes) {
    return (
      <div className="space-y-5">
        <Alert variant="success">Two-factor authentication is on.</Alert>
        <RecoveryCodesPanel codes={state.recoveryCodes} />
        <Link href="/" className={buttonClass("primary")}>
          I&apos;ve saved my codes, continue
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Verification code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        autoFocus
        maxLength={6}
        placeholder="123456"
        className="max-w-40 font-mono tracking-widest"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton pendingText="Verifying…">Turn on 2FA</SubmitButton>
    </form>
  );
}
