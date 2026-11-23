import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, derivatives, galleries, galleryItems } from "@/lib/db/schema";
import { enqueueWatermarkForGallery } from "@/lib/ingest/watermark-enqueue";
import { hashPassword } from "@/lib/password";
import { requireAdminSession } from "@/lib/require-admin";
import {
  badRequest,
  nullableDate,
  nullableString,
  optionalBoolean,
  optionalEnum,
  optionalInteger,
  optionalString,
  withJsonBody,
} from "@/lib/request-body";
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
      kind: assets.kind,
      capturedAt: assets.capturedAt,
      lqip: assets.lqip,
      position: galleryItems.position,
      caption: galleryItems.caption,
      thumbKey: derivatives.storageKey,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    // The clean thumbnail only: matching the watermarked one too would return a
    // photo with both as two rows -- the same photo twice in the grid.
    .leftJoin(
      derivatives,
      and(
        eq(derivatives.assetId, assets.id),
        eq(derivatives.variant, "400"),
        eq(derivatives.format, "webp"),
        eq(derivatives.watermarked, false),
      ),
    )
    .where(and(eq(galleryItems.galleryId, id), isNull(assets.deletedAt)))
    .orderBy(asc(galleryItems.position));

  return NextResponse.json(
    {
      gallery,
      items: items.map((i) => ({ ...i, thumbUrl: i.thumbKey ? publicDerivativeUrl(i.thumbKey) : null, thumbKey: undefined })),
    },
    // The studio editor re-fetches this repeatedly while photos are uploading to
    // pick up newly-attached items -- an intermediary caching a GET response here
    // (or the browser itself, absent this header) could show a stale item list well
    // after the server-side data has already moved on.
    { headers: { "Cache-Control": "no-store" } },
  );
}

const VISIBILITIES = ["public", "unlisted", "password", "private"] as const;
const SORT_MODES = ["capture_date", "upload_date", "filename", "manual"] as const;
const DOWNLOAD_POLICIES = ["off", "web", "original"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  return withJsonBody(req, async (body) => {
    // Each accepted field is read and checked by name. The body used to be spread
    // straight into the update, so a wrong value became a database error (500) and any
    // column, including ones like slug or folderId, could be written unchecked.
    const patch: Partial<typeof galleries.$inferInsert> = {};
    const title = optionalString(body, "title", { max: 200 });
    if (title !== undefined) {
      if (!title) return badRequest("title can't be empty");
      patch.title = title;
    }
    const description = nullableString(body, "description", { max: 5000 });
    if (description !== undefined) patch.description = description || null;
    const visibility = optionalEnum(body, "visibility", VISIBILITIES);
    if (visibility !== undefined) patch.visibility = visibility;
    const password = optionalString(body, "password", { max: 200, trim: false });
    if (password) patch.passwordHash = await hashPassword(password);
    const expiresAt = nullableDate(body, "expiresAt");
    if (expiresAt !== undefined) patch.expiresAt = expiresAt;
    const sortMode = optionalEnum(body, "sortMode", SORT_MODES);
    if (sortMode !== undefined) patch.sortMode = sortMode;
    if (body.sortDirection === null) patch.sortDirection = null;
    else {
      const sortDirection = optionalEnum(body, "sortDirection", ["asc", "desc"] as const);
      if (sortDirection !== undefined) patch.sortDirection = sortDirection;
    }
    const downloadsPolicy = optionalEnum(body, "downloadsPolicy", DOWNLOAD_POLICIES);
    if (downloadsPolicy !== undefined) patch.downloadsPolicy = downloadsPolicy;
    const publicDownloadsPolicy = optionalEnum(body, "publicDownloadsPolicy", DOWNLOAD_POLICIES);
    if (publicDownloadsPolicy !== undefined) patch.publicDownloadsPolicy = publicDownloadsPolicy;
    const metaKeywords = nullableString(body, "metaKeywords", { max: 1000 });
    if (metaKeywords !== undefined) patch.metaKeywords = metaKeywords || null;
    const rightClickMessage = nullableString(body, "rightClickMessage", { max: 500 });
    if (rightClickMessage !== undefined) patch.rightClickMessage = rightClickMessage || null;
    for (const key of ["showCameraInfo", "showFilenames", "slideshowEnabled", "mapEnabled", "searchable"] as const) {
      const value = optionalBoolean(body, key);
      if (value !== undefined) patch[key] = value;
    }
    const coverAssetId = nullableString(body, "coverAssetId", { max: 100 });
    if (coverAssetId !== undefined) patch.coverAssetId = coverAssetId || null;
    const watermarkId = nullableString(body, "watermarkId", { max: 100 });
    if (watermarkId !== undefined) patch.watermarkId = watermarkId || null;
    const position = optionalInteger(body, "position");
    if (position !== undefined) patch.position = position;
    const publish = optionalBoolean(body, "publish");
    if (publish !== undefined) patch.publishedAt = publish ? new Date() : null;
    if (Object.keys(patch).length === 0) return badRequest("nothing to update");

    let gallery;
    try {
      [gallery] = await db.update(galleries).set(patch).where(eq(galleries.id, id)).returning();
    } catch (err) {
      // A cover photo or watermark id that doesn't exist.
      if (err instanceof Error && err.message.includes("foreign key")) return badRequest("that photo or watermark doesn't exist");
      throw err;
    }
    if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Assigning (or changing) a gallery's watermark generates watermarked derivatives
    // for every item currently in it — new items get their own job on add (see
    // items/route.ts). Clearing it (null) leaves existing watermarked derivatives in
    // place rather than deleting them; the public site just stops serving them.
    if (patch.watermarkId) {
      await enqueueWatermarkForGallery(id, patch.watermarkId);
    }

    return NextResponse.json({ ...gallery, passwordHash: undefined });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  await db.delete(galleries).where(eq(galleries.id, id));
  return NextResponse.json({ ok: true });
}
