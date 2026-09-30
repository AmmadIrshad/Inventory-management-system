import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
import { sendEmail, type EmailContent } from "@/lib/mail";

export function appUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, env().APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Sends after the response is flushed: the user isn't kept waiting on SMTP, and response
 * timing doesn't reveal whether an email was sent (i.e. whether an account exists).
 */
export function sendEmailInBackground(to: string, content: EmailContent): void {
  after(async () => {
    try {
      await sendEmail(to, content);
    } catch (error) {
      console.error(`[email] failed to send "${content.subject}"`, error);
    }
  });
}

export function verifyEmailMessage(name: string, token: string, expiresInHours: number): EmailContent {
  return {
    subject: "Verify your email for Inventory",
    preheader: "Confirm your email address to activate your account.",
    heading: "Confirm your email address",
    paragraphs: [`Hi ${name},`, "Thanks for creating an Inventory account. Confirm that this is your email address to activate it."],
    action: { label: "Verify email address", url: appUrl("/verify-email", { token }) },
    notes: [
      `This link expires in ${expiresInHours} hours and can be used once.`,
      "If you didn't create an account, you can safely ignore this email.",
    ],
  };
}

export function accountExistsMessage(name: string, options: { hasPassword: boolean }): EmailContent {
  return {
    subject: "You already have an Inventory account",
    preheader: "Someone tried to sign up with your email address.",
    heading: "You already have an account",
    paragraphs: [
      `Hi ${name},`,
      "Someone (hopefully you) tried to create a new Inventory account with this email address, but it already belongs to an account.",
      options.hasPassword
        ? "You can sign in with your existing password, or reset it if you've forgotten it."
        : "Your account signs in with Google. If you'd also like a password, use “Forgot password” to create one.",
    ],
    action: { label: "Sign in", url: appUrl("/login") },
    notes: [
      `Forgot your password? ${appUrl("/forgot-password")}`,
      "If this wasn't you, you can ignore this email. Nothing has changed.",
    ],
  };
}

export function passwordResetMessage(name: string, token: string, expiresInMinutes: number): EmailContent {
  return {
    subject: "Reset your Inventory password",
    preheader: "Use this link to choose a new password.",
    heading: "Reset your password",
    paragraphs: [`Hi ${name},`, "We received a request to reset the password for your Inventory account."],
    action: { label: "Choose a new password", url: appUrl("/reset-password", { token }) },
    notes: [
      `This link expires in ${expiresInMinutes} minutes and can be used once.`,
      "If you didn't ask for this, ignore this email. Your password won't change.",
    ],
  };
}

export function passwordChangedMessage(name: string): EmailContent {
  return {
    subject: "Your Inventory password was changed",
    preheader: "Security notice: your password was just changed.",
    heading: "Your password was changed",
    paragraphs: [
      `Hi ${name},`,
      "The password for your Inventory account was just changed, and every device was signed out.",
      "If this was you, there's nothing else to do. If it wasn't, reset your password right away.",
    ],
    action: { label: "Reset password", url: appUrl("/forgot-password") },
  };
}

export function twoFactorDisabledMessage(name: string, via: "recovery-code" | "settings"): EmailContent {
  return {
    subject: "Two-factor authentication was turned off",
    preheader: "Security notice: 2FA is now off for your account.",
    heading: "Two-factor authentication is off",
    paragraphs: [
      `Hi ${name},`,
      via === "recovery-code"
        ? "Two-factor authentication was turned off for your Inventory account using one of your recovery codes."
        : "Two-factor authentication was turned off for your Inventory account from its security settings.",
      "If this was you, set it up again on your new device as soon as you can. If it wasn't, reset your password immediately.",
    ],
    action: { label: "Open security settings", url: appUrl("/settings/security") },
  };
}

export function googleLinkedMessage(name: string): EmailContent {
  return {
    subject: "Google sign-in was connected to your account",
    preheader: "Security notice: you can now sign in with Google.",
    heading: "Google sign-in connected",
    paragraphs: [
      `Hi ${name},`,
      "Your Inventory account can now be signed in to with the Google account that uses this email address.",
      "If this wasn't you, reset your password and contact your administrator.",
    ],
    action: { label: "Open security settings", url: appUrl("/settings/security") },
  };
}
