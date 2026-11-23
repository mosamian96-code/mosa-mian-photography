import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { EmailError, sendPasswordResetEmail } from "@/lib/email";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const RESET_LINK_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Emails a password-reset link to a studio account. Answers the same way whether or
 * not the address has an account, so the form can't be used to find out which emails
 * do. The address is matched ignoring case and surrounding spaces.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const raw = (body as { email?: unknown } | null)?.email;
    const email = typeof raw === "string" ? raw.trim() : "";
    if (!email || email.length > 254) {
      return Response.json({ error: "Enter your email address." }, { status: 400 });
    }

    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = lower(${email})`,
    });
    if (!user?.email) return Response.json({ success: true });

    const token = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      token,
      email: user.email,
      expiresAt: new Date(Date.now() + RESET_LINK_LIFETIME_MS),
    });

    const baseUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/studio/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    return Response.json({ success: true });
  } catch (error) {
    await logError("forgot-password", error);
    const detail = error instanceof EmailError ? ` (${error.message})` : "";
    return Response.json({ error: `The reset email couldn't be sent${detail}. Please try again later.` }, { status: 500 });
  }
}
