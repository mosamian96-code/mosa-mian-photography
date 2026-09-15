import { Resend } from "resend";

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  // Constructed lazily, not at module scope: this module is imported by the
  // route handler that Next.js's build-time page-data collection loads, and the
  // Resend constructor throws synchronously when the key is missing/empty --
  // which it always is during the Docker build stage (no secrets at build time,
  // see Dockerfile).
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    // mosamianphotography.com is not yet a verified sending domain in Resend
    // (confirmed live: sending "from" that address 403s with "domain not
    // verified"), so this uses Resend's own always-available sender instead.
    // Once the domain is verified at resend.com/domains, switch this back to
    // an address like noreply@mosamianphotography.com for proper branding.
    from: "onboarding@resend.dev",
    to: email,
    subject: "Reset your password",
    html: `
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }

  return result;
}
