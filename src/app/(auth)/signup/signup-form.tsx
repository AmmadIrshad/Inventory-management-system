"use client";

import { useActionState } from "react";
import { signup, type SignupFormState } from "@/app/actions/auth";
import { PasswordField } from "@/components/password-field";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function SignupForm() {
  const [state, action] = useActionState<SignupFormState, FormData>(signup, {});

  if (state.sentTo) {
    return (
      <div className="space-y-5">
        <Alert variant="success">
          Check your inbox. We sent a verification link to <strong>{state.sentTo}</strong>. Click it to
          activate your account, then sign in.
        </Alert>
        <p className="text-sm leading-6 text-gray-600">
          Nothing after a few minutes? Check your spam folder, or send the link again.
        </p>
        <ResendVerificationForm email={state.sentTo} />
      </div>
    );
  }

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
