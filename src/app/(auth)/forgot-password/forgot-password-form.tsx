"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/password-reset";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">{state.success}</Alert>}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton fullWidth pendingText="Sending…">
        {state.success ? "Send another link" : "Send reset link"}
      </SubmitButton>
    </form>
  );
}
