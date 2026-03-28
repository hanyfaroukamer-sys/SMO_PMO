/**
 * Send email notification when a user is @mentioned in a discussion.
 * Supports SMTP (nodemailer) and SendGrid as transports.
 * Falls back gracefully — mention emails are non-blocking.
 */

interface MentionEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMentionEmail(payload: MentionEmailPayload): Promise<void> {
  // Try SendGrid first
  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: process.env.SMTP_FROM || "noreply@strategypmo.app", name: "StrategyPMO" },
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
        from: process.env.SMTP_FROM || "noreply@strategypmo.app",
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
