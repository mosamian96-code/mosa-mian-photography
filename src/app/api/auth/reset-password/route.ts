import { and, eq } from "drizzle-orm";
import { forgetPasswordChangeCache } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";
import { hashPassword } from "@/lib/password";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Sets a new password from a reset link (token + email, see forgot-password). Every
 * outstanding reset link for the account stops working once one has been used, and
 * every existing studio session is signed out (passwordChangedAt, see auth config). */
export async function POST(request: Request) {
  try {
    // Reset tokens are 64 random hex characters, so guessing is hopeless anyway; this
    // just stops a script hammering the endpoint.
    const limited = await rateLimit("reset-password", requestIp(request), { limit: 10, windowSeconds: 60 * 60 });
    if (limited) return limited;

    const body: unknown = await request.json().catch(() => null);
    const { token, email, newPassword } = (body ?? {}) as Record<string, unknown>;

    if (typeof token !== "string" || typeof email !== "string" || typeof newPassword !== "string" || !token || !email) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (newPassword.length > 200) {
      return Response.json({ error: "Password must be at most 200 characters" }, { status: 400 });
    }

    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.email, email)),
    });
    if (!resetToken) {
      return Response.json({ error: "This reset link is invalid or has already been used." }, { status: 400 });
    }
    if (new Date() > resetToken.expiresAt) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
      return Response.json({ error: "This reset link has expired. Request a new one." }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() })
      .where(eq(users.email, resetToken.email))
      .returning({ id: users.id });
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, resetToken.email));
    if (updated) forgetPasswordChangeCache(updated.id);

    return Response.json({ success: true });
  } catch (error) {
    await logError("reset-password", error);
    return Response.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
