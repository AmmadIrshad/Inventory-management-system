"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { PasswordField } from "@/components/password-field";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function SignupForm() {
  const [state, action] = useActionState<FormState, FormData>(signup, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        required
        autoFocus
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <PasswordField
        label="Password"
        name="password"
        errors={state.fieldErrors?.password}
        relatedFieldNames={["name", "email"]}
      />
      <SubmitButton fullWidth pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
