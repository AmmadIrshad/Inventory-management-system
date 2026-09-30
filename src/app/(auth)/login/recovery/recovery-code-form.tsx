"use client";

import { useActionState } from "react";
import { signInWithRecoveryCode } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function RecoveryCodeForm() {
  const [state, action] = useActionState<FormState, FormData>(signInWithRecoveryCode, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Recovery code"
        name="code"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
        maxLength={64}
        placeholder="xxxx-xxxx-xxxx-xxxx"
        className="font-mono tracking-wider"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton variant="danger" fullWidth pendingText="Turning off 2FA…">
        Turn off 2FA and sign in
      </SubmitButton>
    </form>
  );
}
