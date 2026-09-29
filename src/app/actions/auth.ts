"use server";

import { redirect } from "next/navigation";
import { fieldErrorsOf, codeSchema, loginSchema, signupSchema } from "@/lib/validation";
import { formValue, type FormState } from "@/lib/form-state";
import { clearRateLimit, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { deleteSessionCookie, getSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/dal";
import {
  authStateOf,
  createSession,
  invalidateSessionToken,
  markSessionTwoFactorVerified,
  recordFailedTwoFactorAttempt,
} from "@/lib/auth/session";
import { verifySecondFactor } from "@/lib/auth/two-factor";
import { registerUser, verifyCredentials } from "@/lib/auth/users";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export type LoginFormState = FormState & { suggestPasswordReset?: boolean };

async function discardCurrentSession(): Promise<void> {
  const token = await getSessionToken();
  if (token) await invalidateSessionToken(token);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: formValue(formData, "name"), email: formValue(formData, "email") };
  const parsed = signupSchema.safeParse({ ...values, password: formValue(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const meta = await getRequestMeta();
  const limit = rateLimit(`signup:ip:${meta.ipAddress}`, 10, ONE_HOUR);
  if (!limit.ok) {
    return { error: `Too many sign-ups from your network. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`, values };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  await discardCurrentSession();
  const { token } = await createSession(result.user, meta);
  await setSessionCookie(token);
  redirect("/settings/security?welcome=1");
}

export async function login(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const values = { email: formValue(formData, "email") };
  const parsed = loginSchema.safeParse({ ...values, password: formValue(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email, password } = parsed.data;
  const meta = await getRequestMeta();
  const emailKey = `login:email:${email}`;
  for (const limit of [
    rateLimit(`login:ip:${meta.ipAddress}`, 50, FIFTEEN_MINUTES),
    rateLimit(emailKey, 10, FIFTEEN_MINUTES),
  ]) {
    if (!limit.ok) {
      return {
        error: `Too many sign-in attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
        values,
        suggestPasswordReset: true,
      };
    }
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return { error: "Incorrect email or password.", values, suggestPasswordReset: true };
  }
  clearRateLimit(emailKey);

  await discardCurrentSession();
  const { token } = await createSession(user, meta);
  await setSessionCookie(token);
  redirect(user.totpEnabledAt ? "/login/two-factor" : "/");
}

export async function verifyTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/login?error=session-expired");
  if (authStateOf(current) === "authenticated") redirect("/");

  const parsed = codeSchema.safeParse({ code: formValue(formData, "code") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const result = await verifySecondFactor(current.user.id, parsed.data.code);
  if (!result.ok) {
    const attemptsLeft = await recordFailedTwoFactorAttempt(current.session.id);
    if (attemptsLeft === 0) {
      await deleteSessionCookie();
      redirect("/login?error=too-many-attempts");
    }
    return {
      error: `That code didn't work. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
    };
  }

  await markSessionTwoFactorVerified(current.session.id);
  redirect(result.method === "recovery-code" ? "/login/recovery-used" : "/");
}

export async function logout(): Promise<void> {
  await discardCurrentSession();
  await deleteSessionCookie();
  redirect("/login");
}
