import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries, watermarks } from "@/lib/db/schema";
import { enqueueWatermarkForGallery } from "@/lib/ingest/watermark-enqueue";
import { requireAdminSession } from "@/lib/require-admin";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const body = (await req.json()) as Partial<{
    name: string;
    position: "bottom_right" | "bottom_left" | "top_right" | "top_left" | "center" | "tile";
    opacity: number;
  }>;

  const [row] = await db.update(watermarks).set(body).where(eq(watermarks.id, id)).returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Position/opacity changed: every gallery using this watermark needs its
  // watermarked derivatives regenerated to reflect the new settings.
  if (body.position !== undefined || body.opacity !== undefined) {
    const affected = await db.query.galleries.findMany({
      where: eq(galleries.watermarkId, id),
      columns: { id: true },
    });
    await Promise.all(affected.map((g) => enqueueWatermarkForGallery(g.id, id)));
  }

  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const row = await db.query.watermarks.findFirst({ where: eq(watermarks.id, id) });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Galleries referencing this watermark fall back to unwatermarked (schema: onDelete
  // set null) automatically; their existing watermarked derivatives are just orphaned
  // storage objects, not served since the gallery no longer has a watermarkId.
  await db.delete(watermarks).where(eq(watermarks.id, id));
  await deleteObject(row.storageKey);

  return NextResponse.json({ ok: true });
}
