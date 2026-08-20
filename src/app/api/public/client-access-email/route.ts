import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Optional email capture before viewing (brief section 9) — stored directly on the
// client_access row so the admin's client list picks it up without a separate table.
export async function POST(req: NextRequest) {
  const { token, email } = (await req.json()) as { token?: string; email?: string };
  if (!token || !email?.trim()) {
    return NextResponse.json({ error: "token and email required" }, { status: 400 });
  }

  const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.token, token) });
  const isExpired = Boolean(link?.expiresAt && link.expiresAt < new Date());
  if (!link || link.revokedAt || isExpired) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!link.email) {
    await db.update(clientAccess).set({ email: email.trim() }).where(eq(clientAccess.id, link.id));
  }

  return NextResponse.json({ ok: true });
}
