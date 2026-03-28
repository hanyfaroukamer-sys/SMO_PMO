/**
 * Send email notification when a user is @mentioned in a discussion.
 * Supports Resend, SendGrid, and SMTP (nodemailer) as transports.
 * Falls back gracefully — mention emails are non-blocking.
 */

interface MentionEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMentionEmail(payload: MentionEmailPayload): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || "noreply@strategypmo.app";

  // Try Resend first
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body}`);
    }
    return;
  }

  // Try SendGrid
  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: from, name: "StrategyPMO" },
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

  // Try SMTP via nodemailer
  if (process.env.SMTP_HOST) {
    try {
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
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return;
    } catch (err) {
      throw new Error(`SMTP send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // No email transport configured — log and skip
  console.log(`[mention-email] No email transport configured. Would send to ${payload.to}: ${payload.subject}`);
}
