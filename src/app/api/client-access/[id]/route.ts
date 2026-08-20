import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const body = (await req.json()) as Partial<{
    revoke: boolean;
    downloadsEnabled: boolean;
    canFavorite: boolean;
    canComment: boolean;
  }>;

  const { revoke, ...rest } = body;
  const patch: Record<string, unknown> = { ...rest };
  if (revoke !== undefined) patch.revokedAt = revoke ? new Date() : null;

  const [link] = await db.update(clientAccess).set(patch).where(eq(clientAccess.id, id)).returning();
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...link, passwordHash: undefined });
}
