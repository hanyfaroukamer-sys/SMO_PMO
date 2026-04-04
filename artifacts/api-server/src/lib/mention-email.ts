/**
 * Transactional email sender for StrategyPMO.
 * Used for @mention notifications, task reminders, and approval alerts.
 *
 * Priority cascade — first configured transport wins:
 *   1. Resend  (RESEND_API_KEY)    — easiest, free tier 100 emails/day
 *   2. SendGrid (SENDGRID_API_KEY) — enterprise, generous free tier
 *   3. SMTP    (SMTP_HOST)         — corporate Exchange/Google Workspace
 *   4. Console log                 — no transport configured, logs only
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_FROM || "noreply@strategypmo.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "StrategyPMO";

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // 1. Resend — simplest setup, just one API key
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body}`);
    }
    return;
  }

  // 2. SendGrid
  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: payload.subject,
        content: [
          { type: "text/plain", value: payload.text },
          { type: "text/html", value: payload.html },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SendGrid ${res.status}: ${body}`);
    }
    return;
  }

  // 3. SMTP (nodemailer)
  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || "",
      } : undefined,
    });
    await transport.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return;
  }

  // 4. No transport — log to console
  console.log(`[email] No transport configured. Would send to ${payload.to}: ${payload.subject}`);
}

/** Convenience wrapper for @mention emails */
export async function sendMentionEmail(payload: EmailPayload): Promise<void> {
  return sendEmail(payload);
}

/** Check if any email transport is configured */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);
}
