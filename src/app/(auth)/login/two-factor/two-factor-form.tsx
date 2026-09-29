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
        label="Authentication or recovery code"
        name="code"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
        maxLength={64}
        placeholder="123456  or  xxxx-xxxx-xxxx-xxxx"
        className="font-mono tracking-wider"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton fullWidth pendingText="Verifying…">
        Verify
      </SubmitButton>
    </form>
  );
}
