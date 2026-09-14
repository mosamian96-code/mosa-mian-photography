import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, derivatives, galleries, galleryItems } from "@/lib/db/schema";
import { enqueueWatermarkForGallery } from "@/lib/ingest/watermark-enqueue";
import { hashPassword } from "@/lib/password";
import { requireAdminSession } from "@/lib/require-admin";
import { publicDerivativeUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, id) });
  if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = await db
    .select({
      assetId: assets.id,
      filename: assets.originalFilename,
      capturedAt: assets.capturedAt,
      lqip: assets.lqip,
      position: galleryItems.position,
      caption: galleryItems.caption,
      thumbKey: derivatives.storageKey,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .leftJoin(
      derivatives,
      and(eq(derivatives.assetId, assets.id), eq(derivatives.variant, "400"), eq(derivatives.format, "webp")),
    )
    .where(and(eq(galleryItems.galleryId, id), isNull(assets.deletedAt)))
    .orderBy(asc(galleryItems.position));

  return NextResponse.json({
    gallery,
    items: items.map((i) => ({ ...i, thumbUrl: i.thumbKey ? publicDerivativeUrl(i.thumbKey) : null, thumbKey: undefined })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const body = (await req.json()) as Partial<{
    title: string;
    description: string;
    visibility: "public" | "unlisted" | "password" | "private";
    password: string;
    expiresAt: string | null;
    sortMode: "capture_date" | "upload_date" | "filename" | "manual";
    sortDirection: "asc" | "desc" | null;
    downloadsPolicy: "off" | "web" | "original";
    publicDownloadsPolicy: "off" | "web" | "original";
    metaKeywords: string | null;
    showCameraInfo: boolean;
    showFilenames: boolean;
    slideshowEnabled: boolean;
    mapEnabled: boolean;
    rightClickMessage: string | null;
    searchable: boolean;
    coverAssetId: string;
    watermarkId: string | null;
    publish: boolean;
    position: number;
  }>;

  const { password, publish, expiresAt, ...rest } = body;
  const patch: Record<string, unknown> = { ...rest };
  if (password) patch.passwordHash = hashPassword(password);
  if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (publish !== undefined) patch.publishedAt = publish ? new Date() : null;

  const [gallery] = await db.update(galleries).set(patch).where(eq(galleries.id, id)).returning();
  if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Assigning (or changing) a gallery's watermark generates watermarked derivatives
  // for every item currently in it — new items get their own job on add (see
  // items/route.ts). Clearing it (null) leaves existing watermarked derivatives in
  // place rather than deleting them; the public site just stops serving them.
  if (body.watermarkId) {
    await enqueueWatermarkForGallery(id, body.watermarkId);
  }

  return NextResponse.json(gallery);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  await db.delete(galleries).where(eq(galleries.id, id));
  return NextResponse.json({ ok: true });
}
