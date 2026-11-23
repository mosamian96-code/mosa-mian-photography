import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Disabled. This used to set any account's password for anyone who sent a "magic
 * token" -- which defaulted to a fixed string published in this public repo whenever
 * ADMIN_RESET_TOKEN wasn't set (it wasn't, in production). That made it a way for
 * anyone to take over the studio. Nothing in the app calls it; the supported path is
 * the studio's "Forgot your password?" email flow (/api/auth/forgot-password).
 * Kept as a 404 rather than deleted until the owner approves removing the file.
 */
export async function POST() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
