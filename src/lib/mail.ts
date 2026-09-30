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

export type EmailContent = {
  subject: string;
  /** Inbox preview text. */
  preheader: string;
  heading: string;
  /** Plain-text paragraphs; escaped for HTML. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the button. */
  notes?: string[];
};

/** One layout for every message: an HTML version for mail apps plus a plain-text fallback. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const { heading, preheader, paragraphs, action, notes = [] } = content;

  const text = [
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    ...notes.flatMap((note) => [note, ""]),
    "— Inventory",
  ].join("\n");

  const p = (value: string, style = "") =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#374151;${style}">${escapeHtml(value)}</p>`;

  const button = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#4f46e5;">
         <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b7280;">If the button doesn't work, paste this link into your browser:<br><a href="${escapeHtml(action.url)}" style="color:#4f46e5;word-break:break-all;">${escapeHtml(action.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
      <tr><td style="padding:0 0 16px;font-size:18px;font-weight:700;color:#111827;">&#9635; Inventory</td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
        <h1 style="margin:0 0 20px;font-size:20px;line-height:28px;color:#111827;">${escapeHtml(heading)}</h1>
        ${paragraphs.map((paragraph) => p(paragraph)).join("\n")}
        ${button}
        ${notes.map((note) => p(note, "font-size:13px;line-height:20px;color:#6b7280;")).join("\n")}
      </td></tr>
      <tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:#9ca3af;">This is an automated security email from Inventory. Please don't reply.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { html, text };
}

export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const { html, text } = renderEmail(content);
  await getTransporter().sendMail({ from: env().MAIL_FROM, to, subject: content.subject, html, text });
}
