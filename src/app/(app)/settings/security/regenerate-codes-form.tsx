"use client";

import { useActionState } from "react";
import { regenerateCodes, type RecoveryCodesFormState } from "@/app/actions/two-factor";
import { RecoveryCodesPanel } from "@/components/recovery-codes-panel";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function RegenerateCodesForm() {
  const [state, action] = useActionState<RecoveryCodesFormState, FormData>(regenerateCodes, {});

  if (state.recoveryCodes) return <RecoveryCodesPanel codes={state.recoveryCodes} />;

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Current authenticator code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={6}
        placeholder="123456"
        className="max-w-40 font-mono tracking-widest"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton variant="secondary" pendingText="Generating…">
        Generate new recovery codes
      </SubmitButton>
    </form>
  );
}
