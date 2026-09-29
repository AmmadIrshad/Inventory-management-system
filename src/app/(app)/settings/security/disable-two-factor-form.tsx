"use client";

import { useActionState } from "react";
import { disableTwoFactorWithPassword } from "@/app/actions/two-factor";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function DisableTwoFactorForm() {
  const [state, action] = useActionState<FormState, FormData>(disableTwoFactorWithPassword, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="max-w-sm"
        errors={state.fieldErrors?.password}
      />
      <SubmitButton variant="danger" pendingText="Turning off…">
        Turn off 2FA
      </SubmitButton>
    </form>
  );
}
