"use server";

import { redirect } from "next/navigation";
import { codeSchema, fieldErrorsOf, forgotPasswordSchema, loginSchema, signupSchema } from "@/lib/validation";
import { formValue, type FormState } from "@/lib/form-state";
import {
  accountExistsMessage,
  sendEmailInBackground,
  twoFactorDisabledMessage,
  verifyEmailMessage,
} from "@/lib/emails";
import { clearRateLimit, firstBlocked, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { EMAIL_VERIFICATION_TTL_HOURS } from "@/lib/auth/constants";
import { deleteSessionCookie, getSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/dal";
import {
  createEmailVerificationToken,
  findUnverifiedUser,
  verifyEmailWithToken,
} from "@/lib/auth/email-verification";
import {
  authStateOf,
  createSession,
  invalidateSessionToken,
  invalidateUserSessions,
  markSessionTwoFactorVerified,
  recordFailedTwoFactorAttempt,
  type SessionWithUser,
} from "@/lib/auth/session";
import { disableTwoFactorWithRecoveryCode, verifyAuthenticatorCode } from "@/lib/auth/two-factor";
import { registerUser, verifyCredentials } from "@/lib/auth/users";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export type LoginFormState = FormState & { suggestPasswordReset?: boolean };
export type SignupFormState = FormState & { sentTo?: string };

async function discardCurrentSession(): Promise<void> {
  const token = await getSessionToken();
  if (token) await invalidateSessionToken(token);
}

async function sendVerificationEmail(user: { id: string; email: string; name: string }): Promise<void> {
  const token = await createEmailVerificationToken(user.id);
  sendEmailInBackground(user.email, verifyEmailMessage(user.name, token, EMAIL_VERIFICATION_TTL_HOURS));
}

export async function signup(_prev: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const values = { name: formValue(formData, "name"), email: formValue(formData, "email") };
  const parsed = signupSchema.safeParse({ ...values, password: formValue(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const meta = await getRequestMeta();
  const blocked = firstBlocked([
    await rateLimit(`signup:ip:${meta.ipAddress}`, 10, ONE_HOUR),
    await rateLimit(`signup:email:${parsed.data.email}`, 5, ONE_HOUR),
  ]);
  if (blocked) {
    return { error: `Too many sign-up attempts. Try again in ${formatRetryAfter(blocked.retryAfterSeconds)}.`, values };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  // Same response either way, so the form can't be used to find out who has an account.
  if (result.status === "verification-required") {
    await sendVerificationEmail(result.user);
  } else {
    sendEmailInBackground(result.user.email, accountExistsMessage(result.user.name, { hasPassword: result.user.hasPassword }));
  }
  return { sentTo: result.user.email };
}

export async function resendVerification(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: formValue(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email } = parsed.data;
  const meta = await getRequestMeta();
  const blocked = firstBlocked([
    await rateLimit(`verify-resend:ip:${meta.ipAddress}`, 10, FIFTEEN_MINUTES),
    await rateLimit(`verify-resend:email:${email}`, 3, FIFTEEN_MINUTES),
  ]);
  if (blocked) {
    return { error: `Too many requests. Try again in ${formatRetryAfter(blocked.retryAfterSeconds)}.`, values };
  }

  const user = await findUnverifiedUser(email);
  if (user) await sendVerificationEmail({ ...user, email });
  return {
    success: `If ${email} is waiting to be verified, a new link is on its way. It expires in ${EMAIL_VERIFICATION_TTL_HOURS} hours.`,
    values,
  };
}

export async function verifyEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await verifyEmailWithToken(formValue(formData, "token"));
  if (!result.ok) return { error: "This verification link is invalid or has expired." };
  redirect("/login?notice=email-verified");
}

export async function login(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const values = { email: formValue(formData, "email") };
  const parsed = loginSchema.safeParse({ ...values, password: formValue(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email, password } = parsed.data;
  const meta = await getRequestMeta();
  const emailKey = `login:email:${email}`;
  const blocked = firstBlocked([
    await rateLimit(`login:ip:${meta.ipAddress}`, 50, FIFTEEN_MINUTES),
    await rateLimit(emailKey, 10, FIFTEEN_MINUTES),
  ]);
  if (blocked) {
    return {
      error: `Too many sign-in attempts. Try again in ${formatRetryAfter(blocked.retryAfterSeconds)}.`,
      values,
      suggestPasswordReset: true,
    };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return { error: "Incorrect email or password.", values, suggestPasswordReset: true };
  }
  await clearRateLimit(emailKey);

  if (!user.emailVerifiedAt) {
    const resend = await rateLimit(`verify-resend:email:${email}`, 3, FIFTEEN_MINUTES);
    if (resend.ok) await sendVerificationEmail(user);
    return {
      error: resend.ok
        ? `Please verify your email address first. We've sent a new link to ${email}.`
        : `Please verify your email address first. Check ${email} for the link we sent.`,
      values,
    };
  }

  await discardCurrentSession();
  const { token } = await createSession(user, meta);
  await setSessionCookie(token);
  redirect(user.totpEnabledAt ? "/login/two-factor" : "/");
}

async function requirePendingSession(): Promise<SessionWithUser> {
  const current = await getCurrentSession();
  if (!current) redirect("/login?error=session-expired");
  if (authStateOf(current) === "authenticated") redirect("/");
  return current;
}

async function failedSecondFactor(current: SessionWithUser, message: string): Promise<FormState> {
  const attemptsLeft = await recordFailedTwoFactorAttempt(current.session.id);
  if (attemptsLeft === 0) {
    await deleteSessionCookie();
    redirect("/login?error=too-many-attempts");
  }
  return { error: `${message} ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.` };
}

export async function verifyTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requirePendingSession();

  const parsed = codeSchema.safeParse({ code: formValue(formData, "code") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  if (!(await verifyAuthenticatorCode(current.user.id, parsed.data.code))) {
    return failedSecondFactor(current, "That code didn't work.");
  }

  await markSessionTwoFactorVerified(current.session.id);
  redirect("/");
}

/** Lost authenticator: a recovery code marks itself used, turns 2FA off and signs the user in. */
export async function signInWithRecoveryCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requirePendingSession();

  const parsed = codeSchema.safeParse({ code: formValue(formData, "code") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  if (!(await disableTwoFactorWithRecoveryCode(current.user.id, parsed.data.code))) {
    return failedSecondFactor(current, "That recovery code isn't valid or was already used.");
  }

  await markSessionTwoFactorVerified(current.session.id);
  await invalidateUserSessions(current.user.id, { exceptSessionId: current.session.id });
  sendEmailInBackground(current.user.email, twoFactorDisabledMessage(current.user.name, "recovery-code"));
  redirect("/?notice=two-factor-removed");
}

export async function logout(): Promise<void> {
  await discardCurrentSession();
  await deleteSessionCookie();
  redirect("/login");
}
