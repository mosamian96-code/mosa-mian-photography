import { scryptSync, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { token, email, newPassword } = await request.json();

    if (!token || !email || !newPassword) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.email, email)),
    });

    if (!resetToken) {
      return Response.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (new Date() > resetToken.expiresAt) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
      return Response.json({ error: "Token expired" }, { status: 400 });
    }

    const salt = randomBytes(32);
    const hash = scryptSync(newPassword, salt, 64);
    const passwordHash = `${salt.toString("hex")}:${hash.toString("hex")}`;

    await db.update(users).set({ passwordHash }).where(eq(users.email, email));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return Response.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
