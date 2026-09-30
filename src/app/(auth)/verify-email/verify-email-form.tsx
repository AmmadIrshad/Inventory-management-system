"use client";

import { useActionState } from "react";
import { verifyEmail } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyEmail, {});

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <SubmitButton fullWidth pendingText="Verifying…">
        Verify email address
      </SubmitButton>
    </form>
  );
}
