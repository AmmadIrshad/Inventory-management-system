"use client";

import { useActionState } from "react";
import { verifyTwoFactor } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function TwoFactorForm() {
  const [state, action] = useActionState<FormState, FormData>(verifyTwoFactor, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Authentication code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        required
        autoFocus
        maxLength={7}
        placeholder="123456"
        className="font-mono text-lg tracking-[0.4em]"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton fullWidth pendingText="Verifying…">
        Verify
      </SubmitButton>
    </form>
  );
}
