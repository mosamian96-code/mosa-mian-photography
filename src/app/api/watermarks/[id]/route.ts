import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries, watermarks } from "@/lib/db/schema";
import { enqueueWatermarkForGallery } from "@/lib/ingest/watermark-enqueue";
import { requireAdminSession } from "@/lib/require-admin";
import { badRequest, optionalEnum, optionalString, withJsonBody } from "@/lib/request-body";

const WATERMARK_POSITIONS = ["bottom_right", "bottom_left", "top_right", "top_left", "center", "tile"] as const;
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  return withJsonBody(req, async (body) => {
    const patch: Partial<typeof watermarks.$inferInsert> = {};
    const name = optionalString(body, "name", { max: 200 });
    if (name !== undefined) {
      if (!name) return badRequest("name can't be empty");
      patch.name = name;
    }
    const position = optionalEnum(body, "position", WATERMARK_POSITIONS);
    if (position !== undefined) patch.position = position;
    if (body.opacity !== undefined) {
      const opacity = body.opacity;
      if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
        return badRequest("opacity must be a number from 0 to 1");
      }
      patch.opacity = opacity;
    }
    if (Object.keys(patch).length === 0) return badRequest("nothing to update");

    const [row] = await db.update(watermarks).set(patch).where(eq(watermarks.id, id)).returning();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Position/opacity changed: every gallery using this watermark needs its
    // watermarked derivatives regenerated to reflect the new settings.
    if (patch.position !== undefined || patch.opacity !== undefined) {
      const affected = await db.query.galleries.findMany({
        where: eq(galleries.watermarkId, id),
        columns: { id: true },
      });
      await Promise.all(affected.map((g) => enqueueWatermarkForGallery(g.id, id)));
    }

    return NextResponse.json(row);
  });
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
