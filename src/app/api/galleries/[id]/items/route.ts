import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries, galleryItems } from "@/lib/db/schema";
import { enqueueWatermarkForAssets } from "@/lib/ingest/watermark-enqueue";
import { requireAdminSession } from "@/lib/require-admin";
import { stringArray, withJsonBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  return withJsonBody(req, async (body) => {
    const assetIds = stringArray(body, "assetIds");
    const gallery = await db.query.galleries.findFirst({
      where: eq(galleries.id, galleryId),
      columns: { watermarkId: true },
    });
    if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [{ n: startPosition }] = await db
      .select({ n: sql<number>`coalesce(max(${galleryItems.position}), -1) + 1` })
      .from(galleryItems)
      .where(eq(galleryItems.galleryId, galleryId));

    try {
      await db
        .insert(galleryItems)
        .values(assetIds.map((assetId, i) => ({ galleryId, assetId, position: startPosition + i })))
        .onConflictDoNothing();
    } catch (err) {
      if (err instanceof Error && err.message.includes("foreign key")) {
        return NextResponse.json({ error: "one or more photos don't exist" }, { status: 400 });
      }
      throw err;
    }

    // If this gallery already has a watermark assigned, newly added items need their
    // own watermarked derivatives too — existing items were covered when the watermark
    // was originally assigned (see galleries/[id]/route.ts PATCH).
    if (gallery.watermarkId) {
      await enqueueWatermarkForAssets(assetIds, gallery.watermarkId);
    }

    return NextResponse.json({ ok: true, added: assetIds.length });
  });
}

/** Persists a manual drag-to-reorder from the gallery editor. Also switches the
 * gallery to sortMode "manual" -- reordering only has a visible effect on the public
 * site once that's set, and doing it here means the admin doesn't need a separate
 * step to make their drag actually take effect. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  return withJsonBody(req, async (body) => {
    const assetIds = stringArray(body, "assetIds");

    await db.transaction(async (tx) => {
      for (let i = 0; i < assetIds.length; i++) {
        await tx
          .update(galleryItems)
          .set({ position: i })
          .where(and(eq(galleryItems.galleryId, galleryId), eq(galleryItems.assetId, assetIds[i])));
      }
      await tx.update(galleries).set({ sortMode: "manual" }).where(eq(galleries.id, galleryId));
    });

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  await db
    .delete(galleryItems)
    .where(and(eq(galleryItems.galleryId, galleryId), eq(galleryItems.assetId, assetId)));
  return NextResponse.json({ ok: true });
}
