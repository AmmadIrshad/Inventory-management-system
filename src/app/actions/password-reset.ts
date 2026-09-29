"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { env } from "@/lib/env";
import { fieldErrorsOf, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation";
import { formValue, type FormState } from "@/lib/form-state";
import { sendPasswordResetEmail } from "@/lib/mail";
import { formatRetryAfter, rateLimit } from "@/lib/rate-limit";
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
  for (const limit of [
    rateLimit(`reset:ip:${meta.ipAddress}`, 10, FIFTEEN_MINUTES),
    rateLimit(`reset:email:${email}`, 3, FIFTEEN_MINUTES),
  ]) {
    if (!limit.ok) {
      return { error: `Too many reset requests. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`, values };
    }
  }

  const issued = await createPasswordResetToken(email);
  if (issued) {
    const resetUrl = new URL("/reset-password", env().APP_URL);
    resetUrl.searchParams.set("token", issued.token);
    // Send after the response so timing doesn't reveal whether the account exists.
    after(async () => {
      try {
        await sendPasswordResetEmail({
          to: issued.user.email,
          name: issued.user.name,
          resetUrl: resetUrl.toString(),
          expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
        });
      } catch (error) {
        console.error("[password-reset] failed to send email", error);
      }
    });
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

  // Every session was revoked; drop this browser's stale cookie too.
  await deleteSessionCookie();
  redirect("/login?notice=password-reset");
}
