"use server";

import { redirect } from "next/navigation";
import { fieldErrorsOf, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation";
import { formValue, type FormState } from "@/lib/form-state";
import { passwordChangedMessage, passwordResetMessage, sendEmailInBackground } from "@/lib/emails";
import { firstBlocked, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/auth/constants";
import { deleteSessionCookie } from "@/lib/auth/cookies";
import { createPasswordResetToken, resetPasswordWithToken } from "@/lib/auth/password-reset";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: formValue(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email } = parsed.data;
  const meta = await getRequestMeta();
  const blocked = firstBlocked([
    await rateLimit(`reset:ip:${meta.ipAddress}`, 10, FIFTEEN_MINUTES),
    await rateLimit(`reset:email:${email}`, 3, FIFTEEN_MINUTES),
  ]);
  if (blocked) {
    return { error: `Too many reset requests. Try again in ${formatRetryAfter(blocked.retryAfterSeconds)}.`, values };
  }

  const issued = await createPasswordResetToken(email);
  if (issued) {
    sendEmailInBackground(
      issued.user.email,
      passwordResetMessage(issued.user.name, issued.token, PASSWORD_RESET_TTL_MINUTES),
    );
  }

  return {
    success: `If an account exists for ${email}, we've emailed a link to reset its password. The link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
    values,
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formValue(formData, "token"),
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    if (result.reason === "weak-password") return { fieldErrors: { password: result.problems } };
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  sendEmailInBackground(result.user.email, passwordChangedMessage(result.user.name));
  // Every session was revoked; drop this browser's stale cookie too.
  await deleteSessionCookie();
  redirect("/login?notice=password-reset");
}
