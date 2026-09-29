import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .max(254, { error: "Email address is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

const password = z
  .string({ error: "Enter your password." })
  .min(1, { error: "Enter your password." })
  .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` });

export const signupSchema = z.object({
  name: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, { error: "Enter your name." })
    .max(100, { error: "Name is too long." }),
  email,
  password,
});

export const loginSchema = z.object({ email, password });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const codeSchema = z.object({
  code: z
    .string({ error: "Enter a code." })
    .trim()
    .min(1, { error: "Enter a code." })
    .max(64, { error: "That code is too long." }),
});

export const passwordConfirmationSchema = z.object({ password });

export type FieldErrors = Record<string, string[] | undefined>;

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
