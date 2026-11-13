import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERMISSIONS = ["downloadsEnabled", "canFavorite", "canComment"] as const;

/**
 * Updates a client link: its permissions, revocation, and expiry. Only those fields
 * are accepted -- anything else in the body is ignored rather than written through.
 * `expiresAt` is a date ("2026-12-01", meaning the end of that day, UTC) or null for
 * no expiry; changing it re-arms the "expires soon" reminder for the new date.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const json: unknown = await req.json().catch(() => null);
  if (!json || typeof json !== "object") return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  const body = json as Record<string, unknown>;

  const patch: Partial<typeof clientAccess.$inferInsert> = {};
  for (const key of PERMISSIONS) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 });
      patch[key] = body[key];
    }
  }
  if ("revoke" in body) {
    if (typeof body.revoke !== "boolean") return NextResponse.json({ error: "revoke must be true or false" }, { status: 400 });
    patch.revokedAt = body.revoke ? new Date() : null;
  }
  if ("expiresAt" in body) {
    const value = body.expiresAt;
    if (value === null) {
      patch.expiresAt = null;
    } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) {
      const endOfDay = new Date(`${value}T23:59:59.999Z`);
      // To end access now, revoke the link; a past date is almost always a typo.
      if (endOfDay < new Date()) return NextResponse.json({ error: "Choose today or a later date." }, { status: 400 });
      patch.expiresAt = endOfDay;
    } else {
      return NextResponse.json({ error: "expiresAt must be a date (YYYY-MM-DD) or null" }, { status: 400 });
    }
    patch.expiryReminderSentAt = null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const [link] = await db.update(clientAccess).set(patch).where(eq(clientAccess.id, id)).returning();
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...link, passwordHash: undefined });
}
