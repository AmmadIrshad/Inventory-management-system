"use client";

import { useActionState } from "react";
import { disableTwoFactorFromSettings } from "@/app/actions/two-factor";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function DisableTwoFactorForm() {
  const [state, action] = useActionState<FormState, FormData>(disableTwoFactorFromSettings, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Authenticator code or recovery code"
        name="code"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={64}
        placeholder="123456  or  xxxx-xxxx-xxxx-xxxx"
        className="max-w-sm font-mono"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton variant="danger" pendingText="Turning off…">
        Turn off 2FA
      </SubmitButton>
    </form>
  );
}
