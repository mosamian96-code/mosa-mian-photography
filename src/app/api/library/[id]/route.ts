import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assetMetadata, assets, derivatives, galleries, galleryItems } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { publicDerivativeUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, id), isNull(assets.deletedAt)) });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const meta = await db.query.assetMetadata.findFirst({ where: eq(assetMetadata.assetId, id) });
  const derivs = await db.query.derivatives.findMany({
    where: and(eq(derivatives.assetId, id), eq(derivatives.watermarked, false)),
  });
  const fullUrl =
    derivs.find((d) => d.variant === "2560" && d.format === "webp") ??
    derivs.find((d) => d.variant === "1200" && d.format === "webp");

  const memberships = await db
    .select({ galleryId: galleries.id, title: galleries.title })
    .from(galleryItems)
    .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
    .where(eq(galleryItems.assetId, id));

  return NextResponse.json({
    asset: {
      id: asset.id,
      filename: asset.originalFilename,
      kind: asset.kind,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      capturedAt: asset.capturedAt,
      importedAt: asset.importedAt,
      previewUrl: fullUrl ? publicDerivativeUrl(fullUrl.storageKey) : null,
    },
    metadata: meta
      ? {
          camera: meta.camera,
          lens: meta.lens,
          iso: meta.iso,
          shutter: meta.shutter,
          aperture: meta.aperture,
          focalLength: meta.focalLength,
          gpsLat: meta.gpsLat,
          gpsLon: meta.gpsLon,
        }
      : null,
    galleries: memberships,
  });
}

/** Soft delete only -- sets deletedAt rather than removing the row or its B2 objects.
 * Every public-facing and studio query that surfaces assets already filters on
 * isNull(deletedAt) (see src/lib/public-site/resolve.ts), so this is enough to make
 * the photo disappear everywhere immediately without an irreversible storage purge
 * bundled into the same click. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const [updated] = await db.update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, id)).returning({ id: assets.id });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
