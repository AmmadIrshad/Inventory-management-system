"use server";

import { redirect } from "next/navigation";
import { codeSchema, fieldErrorsOf, passwordConfirmationSchema } from "@/lib/validation";
import { formValue, type FormState } from "@/lib/form-state";
import { formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { RECENT_LOGIN_WINDOW_MS } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/dal";
import { invalidateUserSessions, markSessionTwoFactorVerified } from "@/lib/auth/session";
import {
  beginTotpEnrollment,
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  disableTwoFactor,
  regenerateRecoveryCodes,
  verifyTotpOnly,
} from "@/lib/auth/two-factor";
import { verifyUserPassword } from "@/lib/auth/users";

// These actions deliberately don't touch cookies: doing so makes Next.js re-render the page,
// which would replace the one-time recovery codes before the user has saved them.
export type RecoveryCodesFormState = FormState & { recoveryCodes?: string[] };

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function startTwoFactorSetup(): Promise<void> {
  const { user } = await requireUser();
  if (user.totpEnabledAt) redirect("/settings/security");
  await beginTotpEnrollment(user.id);
  redirect("/settings/security/two-factor");
}

export async function cancelTwoFactorSetup(): Promise<void> {
  const { user } = await requireUser();
  await cancelTotpEnrollment(user.id);
  redirect("/settings/security");
}

export async function confirmTwoFactorSetup(
  _prev: RecoveryCodesFormState,
  formData: FormData,
): Promise<RecoveryCodesFormState> {
  const { user, session } = await requireUser();

  const parsed = codeSchema.safeParse({ code: formValue(formData, "code") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const result = await confirmTotpEnrollment(user.id, parsed.data.code);
  if (!result.ok) {
    return {
      error: "That code didn't match. Make sure your phone's clock is set automatically and try the newest code.",
    };
  }

  // This session just proved possession of the authenticator.
  await markSessionTwoFactorVerified(session.id);
  return { recoveryCodes: result.recoveryCodes };
}

export async function regenerateCodes(
  _prev: RecoveryCodesFormState,
  formData: FormData,
): Promise<RecoveryCodesFormState> {
  const { user } = await requireUser();
  if (!user.totpEnabledAt) return { error: "Two-factor authentication is not enabled." };

  const limit = rateLimit(`reauth:${user.id}`, 5, FIFTEEN_MINUTES);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.` };

  const parsed = codeSchema.safeParse({ code: formValue(formData, "code") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  if (!(await verifyTotpOnly(user.id, parsed.data.code))) {
    return { fieldErrors: { code: ["That authenticator code isn't valid."] } };
  }
  return { recoveryCodes: await regenerateRecoveryCodes(user.id) };
}

export async function disableTwoFactorWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, session } = await requireUser();
  if (!user.totpEnabledAt) redirect("/settings/security");

  const limit = rateLimit(`reauth:${user.id}`, 5, FIFTEEN_MINUTES);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.` };

  const parsed = passwordConfirmationSchema.safeParse({ password: formValue(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  if (!(await verifyUserPassword(user.id, parsed.data.password))) {
    return { fieldErrors: { password: ["Incorrect password."] } };
  }

  await disableTwoFactor(user.id);
  // Sessions still waiting for a second factor must not become fully signed in.
  await invalidateUserSessions(user.id, { exceptSessionId: session.id });
  redirect("/settings/security?disabled=1");
}

/** The "yes, remove 2FA" branch after signing in with a recovery code. */
export async function removeTwoFactorAfterRecovery(): Promise<void> {
  const { user, session } = await requireUser();
  if (!user.totpEnabledAt) redirect("/");
  // Only offered right after a recovery-code sign-in; later, use the password-protected setting.
  if (Date.now() - session.createdAt.getTime() > RECENT_LOGIN_WINDOW_MS) {
    redirect("/settings/security");
  }

  await disableTwoFactor(user.id);
  await invalidateUserSessions(user.id, { exceptSessionId: session.id });
  redirect("/?notice=two-factor-removed");
}
