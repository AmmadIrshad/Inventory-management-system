"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginFormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm() {
  const [state, action] = useActionState<LoginFormState, FormData>(login, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <Alert variant="error">
          {state.error}
          {state.suggestPasswordReset && (
            <>
              {" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Forgot your password?
              </Link>
            </>
          )}
        </Alert>
      )}
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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
        labelAside={
          <Link href="/forgot-password" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            Forgot password?
          </Link>
        }
      />
      <SubmitButton fullWidth pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
