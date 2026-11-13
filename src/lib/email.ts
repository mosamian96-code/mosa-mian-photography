import { Resend } from "resend";

/**
 * Resend's shared test sender, used until EMAIL_FROM names an address on a domain
 * verified at resend.com/domains. Resend only delivers the test sender's mail to the
 * Resend account's own address -- fine for password resets and contact-form
 * notifications, which go to the photographer, but client emails need EMAIL_FROM.
 */
const TEST_SENDER = "Mosa Mian Photography <onboarding@resend.dev>";

export function emailSender() {
  return process.env.EMAIL_FROM?.trim() || TEST_SENDER;
}

/** A send Resend refused, with its reason (e.g. an unverified sending domain). */
export class EmailError extends Error {}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  // Constructed lazily, not at module scope: this module is imported by route handlers
  // that Next.js's build-time page-data collection loads, and the Resend constructor
  // throws synchronously when the key is missing -- which it always is during the
  // Docker build stage (no secrets at build time, see Dockerfile).
  if (!process.env.RESEND_API_KEY) throw new EmailError("email isn't set up on this server (RESEND_API_KEY is empty)");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: emailSender(),
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
  });
  if (result.error) throw new EmailError(result.error.message);
  return result.data;
}

/** Client emails' Reply-To, so a client's reply reaches the photographer rather than a
 * no-reply sender. */
export function photographerReplyTo() {
  return process.env.CONTACT_TO_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || undefined;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  return sendEmail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}
