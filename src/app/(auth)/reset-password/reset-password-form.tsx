"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword } from "@/app/actions/password-reset";
import { PasswordField } from "@/components/password-field";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function ResetPasswordForm({ token, userInputs }: { token: string; userInputs: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <Alert variant="error">
          {state.error}{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        name="password"
        errors={state.fieldErrors?.password}
        userInputs={userInputs}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton fullWidth pendingText="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
