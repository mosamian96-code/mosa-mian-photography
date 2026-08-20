import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assetKeywords, assets, derivatives, folders, galleries, galleryItems, keywords } from "@/lib/db/schema";
import { publicDerivativeUrl } from "@/lib/storage";

type Folder = typeof folders.$inferSelect;
type Gallery = typeof galleries.$inferSelect;

export type ResolvedFolder = {
  type: "folder";
  folder: Folder;
  breadcrumb: Folder[];
  subfolders: Folder[];
  galleries: (Gallery & { coverUrl: string | null; photoCount: number })[];
};

export type ResolvedGallery = {
  type: "gallery";
  folder: Folder;
  breadcrumb: Folder[];
  gallery: Gallery;
};

/**
 * Walks a URL's path segments against the folder tree, matching one folder per
 * segment; the final segment may instead be a gallery slug within the last matched
 * folder. Mirrors SmugMug's folders-inside-folders model (brief section 4).
 */
export async function resolvePath(segments: string[]): Promise<ResolvedFolder | ResolvedGallery | null> {
  if (segments.length === 0) return null;

  let parentId: string | null = null;
  let current: Folder | null = null;
  const breadcrumb: Folder[] = [];

  for (let i = 0; i < segments.length; i++) {
    const slug = segments[i];
    const isLast = i === segments.length - 1;

    const folder: Folder | undefined = await db.query.folders.findFirst({
      where: and(parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId), eq(folders.slug, slug)),
    });

    if (folder) {
      current = folder;
      parentId = folder.id;
      breadcrumb.push(folder);
      continue;
    }

    if (isLast && current) {
      const gallery = await db.query.galleries.findFirst({
        where: and(eq(galleries.folderId, current.id), eq(galleries.slug, slug)),
      });
      if (gallery && gallery.publishedAt && gallery.visibility !== "private") {
        return { type: "gallery", folder: current, breadcrumb, gallery };
      }
    }
    return null;
  }

  if (!current) return null;
  const subfolders = await db.query.folders.findMany({
    where: and(eq(folders.parentId, current.id), eq(folders.visibility, "public")),
    orderBy: [asc(folders.position), asc(folders.title)],
  });
  const childGalleries = await db.query.galleries.findMany({
    where: eq(galleries.folderId, current.id),
  });
  const visibleGalleries = childGalleries.filter((g) => g.publishedAt && g.visibility === "public");

  const galleriesWithCovers = await Promise.all(
    visibleGalleries.map(async (gallery) => {
      const [{ n: photoCount }] = await db
        .select({ n: count() })
        .from(galleryItems)
        .where(eq(galleryItems.galleryId, gallery.id));

      const coverAssetId =
        gallery.coverAssetId ??
        (
          await db.query.galleryItems.findFirst({
            where: eq(galleryItems.galleryId, gallery.id),
            orderBy: (gi, { asc: ascOrder }) => [ascOrder(gi.position)],
          })
        )?.assetId;

      const coverDerivative = coverAssetId
        ? await db.query.derivatives.findFirst({
            where: and(
              eq(derivatives.assetId, coverAssetId),
              eq(derivatives.variant, "400"),
              eq(derivatives.format, "webp"),
            ),
          })
        : null;

      return {
        ...gallery,
        coverUrl: coverDerivative ? publicDerivativeUrl(coverDerivative.storageKey) : null,
        photoCount,
      };
    }),
  );

  return {
    type: "folder",
    folder: current,
    breadcrumb,
    subfolders,
    galleries: galleriesWithCovers,
  };
}

export type GalleryImage = {
  assetId: string;
  filename: string;
  width: number | null;
  height: number | null;
  lqip: string | null;
  caption: string | null;
  capturedAt: string | null;
  camera: string | null;
  lens: string | null;
  iso: number | null;
  shutter: string | null;
  aperture: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  /** Keyed as `${format}${variant}`, e.g. "avif400", "webp2560". */
  urls: Record<string, string>;
};

const SORT_COLUMN = {
  capture_date: assets.capturedAt,
  upload_date: assets.importedAt,
  filename: assets.originalFilename,
  manual: galleryItems.position,
} as const;

export async function loadGalleryImages(gallery: Gallery): Promise<GalleryImage[]> {
  const sortColumn = SORT_COLUMN[gallery.sortMode];
  const rows = await db
    .select({
      assetId: assets.id,
      filename: assets.originalFilename,
      width: assets.width,
      height: assets.height,
      lqip: assets.lqip,
      caption: galleryItems.caption,
      capturedAt: assets.capturedAt,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(eq(galleryItems.galleryId, gallery.id))
    .orderBy(gallery.sortMode === "filename" ? asc(sortColumn) : desc(sortColumn));

  const allDerivatives = await db.query.derivatives.findMany({
    where: (d, { inArray }) => inArray(d.assetId, rows.map((r) => r.assetId)),
  });

  const metadataRows = await db.query.assetMetadata.findMany({
    where: (m, { inArray }) => inArray(m.assetId, rows.map((r) => r.assetId)),
  });
  const metaByAsset = new Map(metadataRows.map((m) => [m.assetId, m]));

  // A gallery with a watermark assigned shows watermarked derivatives on screen
  // (brief section 9: proofing protection); clean derivatives are laid down first and
  // watermarked ones overlaid on top of the matching slot, so an asset whose watermark
  // job hasn't finished yet still falls back to its clean image instead of a 404.
  const useWatermark = Boolean(gallery.watermarkId);

  return rows.map((row) => {
    const derivativesForAsset = allDerivatives.filter((d) => d.assetId === row.assetId);
    const urls: Record<string, string> = {};
    for (const d of derivativesForAsset.filter((d) => !d.watermarked)) {
      urls[`${d.format}${d.variant}`] = publicDerivativeUrl(d.storageKey);
    }
    if (useWatermark) {
      for (const d of derivativesForAsset.filter((d) => d.watermarked)) {
        urls[`${d.format}${d.variant}`] = publicDerivativeUrl(d.storageKey);
      }
    }
    const meta = metaByAsset.get(row.assetId);
    return {
      assetId: row.assetId,
      filename: row.filename,
      width: row.width,
      height: row.height,
      lqip: row.lqip,
      caption: row.caption,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      camera: meta?.camera ?? null,
      lens: meta?.lens ?? null,
      iso: meta?.iso ?? null,
      shutter: meta?.shutter ?? null,
      aperture: meta?.aperture ?? null,
      gpsLat: meta?.gpsLat ?? null,
      gpsLon: meta?.gpsLon ?? null,
      urls,
    };
  });
}

/** Asset ids that appear in at least one public, published gallery -- the visibility
 * boundary for cross-gallery browsing (keyword cloud, search). Unlisted/password/
 * private galleries never surface here; that's the whole point of "unlisted". */
async function publiclyVisibleAssetIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ assetId: galleryItems.assetId })
    .from(galleryItems)
    .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
    .where(and(eq(galleries.visibility, "public"), sql`${galleries.publishedAt} is not null`));
  return rows.map((r) => r.assetId);
}

export type KeywordCount = { value: string; count: number };

/** Keyword cloud (brief section 4 gap-fill): every keyword attached to at least one
 * publicly visible asset, with how many such assets carry it. */
export async function listPublicKeywords(): Promise<KeywordCount[]> {
  const visibleIds = await publiclyVisibleAssetIds();
  if (visibleIds.length === 0) return [];

  const rows = await db
    .select({ value: keywords.value, count: count(assetKeywords.assetId) })
    .from(assetKeywords)
    .innerJoin(keywords, eq(keywords.id, assetKeywords.keywordId))
    .where(inArray(assetKeywords.assetId, visibleIds))
    .groupBy(keywords.value)
    .orderBy(desc(count(assetKeywords.assetId)));

  return rows;
}

/**
 * Every publicly visible image tagged with one keyword, across all galleries --
 * a cross-gallery aggregate, not a specific gallery's controlled view, so this
 * always serves clean (never watermarked) derivatives regardless of any individual
 * gallery's watermark setting.
 */
export async function loadKeywordImages(keyword: string): Promise<GalleryImage[]> {
  const visibleIds = await publiclyVisibleAssetIds();
  if (visibleIds.length === 0) return [];

  const taggedRows = await db
    .select({ assetId: assetKeywords.assetId })
    .from(assetKeywords)
    .innerJoin(keywords, eq(keywords.id, assetKeywords.keywordId))
    .where(and(eq(keywords.value, keyword), inArray(assetKeywords.assetId, visibleIds)));

  const assetIds = taggedRows.map((r) => r.assetId);
  if (assetIds.length === 0) return [];

  return loadImagesByAssetIds(assetIds);
}

/** Shared by loadKeywordImages and search results -- loads images by asset id with no
 * gallery context (no per-gallery caption, no watermark preference), sorted newest
 * capture first. */
async function loadImagesByAssetIds(assetIds: string[]): Promise<GalleryImage[]> {
  const rows = await db
    .select({
      assetId: assets.id,
      filename: assets.originalFilename,
      width: assets.width,
      height: assets.height,
      lqip: assets.lqip,
      capturedAt: assets.capturedAt,
    })
    .from(assets)
    .where(inArray(assets.id, assetIds))
    .orderBy(desc(assets.capturedAt));

  const [allDerivatives, metaRows] = await Promise.all([
    db.query.derivatives.findMany({
      where: and(inArray(derivatives.assetId, assetIds), eq(derivatives.watermarked, false)),
    }),
    db.query.assetMetadata.findMany({ where: (m, { inArray: inArr }) => inArr(m.assetId, assetIds) }),
  ]);
  const metaByAsset = new Map(metaRows.map((m) => [m.assetId, m]));

  return rows.map((row) => {
    const urls: Record<string, string> = {};
    for (const d of allDerivatives.filter((d) => d.assetId === row.assetId)) {
      urls[`${d.format}${d.variant}`] = publicDerivativeUrl(d.storageKey);
    }
    const meta = metaByAsset.get(row.assetId);
    return {
      assetId: row.assetId,
      filename: row.filename,
      width: row.width,
      height: row.height,
      lqip: row.lqip,
      caption: null,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      camera: meta?.camera ?? null,
      lens: meta?.lens ?? null,
      iso: meta?.iso ?? null,
      shutter: meta?.shutter ?? null,
      aperture: meta?.aperture ?? null,
      gpsLat: meta?.gpsLat ?? null,
      gpsLon: meta?.gpsLon ?? null,
      urls,
    };
  });
}

export type SearchResults = {
  folders: Folder[];
  galleries: (Gallery & { folderPath: string })[];
  keywords: KeywordCount[];
};

/** Site search (brief section 4 gap-fill): matches public/published folder and
 * gallery titles/descriptions, plus exact-ish keyword matches. Case-insensitive
 * substring match -- no full-text index needed at this library size. */
export async function searchPublicContent(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { folders: [], galleries: [], keywords: [] };
  const pattern = `%${q.toLowerCase()}%`;

  const [matchedFolders, matchedGalleries, matchedKeywords] = await Promise.all([
    db.query.folders.findMany({
      where: and(eq(folders.visibility, "public"), sql`(lower(${folders.title}) like ${pattern} or lower(coalesce(${folders.description}, '')) like ${pattern})`),
      limit: 25,
    }),
    db.query.galleries.findMany({
      where: and(
        eq(galleries.visibility, "public"),
        sql`${galleries.publishedAt} is not null`,
        sql`(lower(${galleries.title}) like ${pattern} or lower(coalesce(${galleries.description}, '')) like ${pattern})`,
      ),
      limit: 25,
    }),
    db
      .select({ value: keywords.value })
      .from(keywords)
      .where(sql`lower(${keywords.value}) like ${pattern}`)
      .limit(10),
  ]);

  const galleriesWithPath = await Promise.all(
    matchedGalleries.map(async (gallery) => {
      const folder = await db.query.folders.findFirst({ where: eq(folders.id, gallery.folderId) });
      return { ...gallery, folderPath: folder ? `/${folder.slug}` : "" };
    }),
  );

  const visibleIds = await publiclyVisibleAssetIds();
  const keywordCounts = await Promise.all(
    matchedKeywords.map(async (k) => {
      if (visibleIds.length === 0) return { value: k.value, count: 0 };
      const [{ n }] = await db
        .select({ n: count() })
        .from(assetKeywords)
        .innerJoin(keywords, eq(keywords.id, assetKeywords.keywordId))
        .where(and(eq(keywords.value, k.value), inArray(assetKeywords.assetId, visibleIds)));
      return { value: k.value, count: n };
    }),
  );

  return {
    folders: matchedFolders,
    galleries: galleriesWithPath,
    keywords: keywordCounts.filter((k) => k.count > 0),
  };
}
