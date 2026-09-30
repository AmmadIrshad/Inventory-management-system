"use client";

import { useActionState } from "react";
import { resendVerification } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

/** With `email` the address is fixed (hidden field); without it the user types it. */
export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState<FormState, FormData>(resendVerification, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">{state.success}</Alert>}
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
      )}
      <SubmitButton variant="secondary" fullWidth={!email} pendingText="Sending…">
        Resend verification email
      </SubmitButton>
    </form>
  );
}
