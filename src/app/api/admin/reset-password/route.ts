import { NextRequest, NextResponse } from "next/server";
import { scryptSync, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, newPassword, token } = (await req.json()) as {
    email?: string;
    newPassword?: string;
    token?: string;
  };

  // Simple security: require a magic token (in production, use proper auth)
  const validToken = process.env.ADMIN_RESET_TOKEN || "admin-reset-token";
  if (token !== validToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email || !newPassword) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  try {
    // Hash password using scrypt (same as the app)
    const salt = randomBytes(32);
    const hash = scryptSync(newPassword, salt, 64);
    const passwordHash = `${salt.toString("hex")}:${hash.toString("hex")}`;

    // Update user
    const result = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.email, email))
      .returning({ id: users.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Password reset successfully" });
  } catch (err) {
    console.error("Password reset error:", err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
