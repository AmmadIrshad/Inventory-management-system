import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = env();
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendPasswordResetEmail(options: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const { to, name, resetUrl, expiresInMinutes } = options;

  await getTransporter().sendMail({
    from: env().MAIL_FROM,
    to,
    subject: "Reset your Inventory password",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset the password for your Inventory account.",
      `Open this link within ${expiresInMinutes} minutes to choose a new password:`,
      "",
      resetUrl,
      "",
      "If you didn't ask for this, you can ignore this email; your password won't change.",
    ].join("\n"),
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
        <h1 style="font-size: 20px;">Reset your password</h1>
        <p>Hi ${escapeHtml(name)},</p>
        <p>We received a request to reset the password for your Inventory account.
           This link expires in ${expiresInMinutes} minutes.</p>
        <p style="margin: 28px 0;">
          <a href="${escapeHtml(resetUrl)}"
             style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Choose a new password
          </a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, paste this URL into your browser:<br>
           <span style="word-break: break-all;">${escapeHtml(resetUrl)}</span></p>
        <p style="font-size: 13px; color: #6b7280;">If you didn't ask for this, ignore this email; your password won't change.</p>
      </div>`,
  });
}
