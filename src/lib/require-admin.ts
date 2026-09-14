import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Every route that touches storage credentials, the DB, or the job queue must call
 * this — proxy.ts only gates /studio pages, not /api/*, so API routes defend
 * themselves.
 */
export async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      session: null as null,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { session, response: null as null };
}
