import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assetKeywords, assets, derivatives, folders, galleries, galleryItems, keywords } from "@/lib/db/schema";
import { publicDerivativeUrl } from "@/lib/storage";

type Folder = typeof folders.$inferSelect;
type Gallery = typeof galleries.$inferSelect;

export type FolderSection = {
  folder: Folder;
  galleries: (Gallery & { coverUrl: string | null; coverLqip: string | null; hoverUrl: string | null })[];
  subsections: FolderSection[];
};

export type ResolvedFolder = {
  type: "folder";
  folder: Folder;
  breadcrumb: Folder[];
  section: FolderSection;
};

export type ResolvedGallery = {
  type: "gallery";
  folder: Folder;
  breadcrumb: Folder[];
  gallery: Gallery;
};

/** Top-level public folders, for the homepage's portfolio grid (galleries always
 * belong to a folder -- schema enforces folder_id not null -- so the root only ever
 * has folders, never bare galleries). */
export async function listRootFolders(): Promise<Folder[]> {
  return db.query.folders.findMany({
    where: and(isNull(folders.parentId), eq(folders.visibility, "public")),
    orderBy: [asc(folders.position), asc(folders.title)],
  });
}

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
  const section = await loadFolderSection(current);
  return { type: "folder", folder: current, breadcrumb, section };
}

/** Builds a folder's full display tree: its own direct galleries plus one
 * FolderSection per direct subfolder, recursively -- SmugMug's actual folder-page
 * behavior (requested directly against the user's SmugMug site), which flattens
 * subfolders into titled sections on the same page rather than making visitors click
 * through an empty-looking tile per subfolder. Public/published filtering happens at
 * every level, same as the old flat version. */
async function loadFolderSection(folder: Folder): Promise<FolderSection> {
  const [subfolders, childGalleries] = await Promise.all([
    db.query.folders.findMany({
      where: and(eq(folders.parentId, folder.id), eq(folders.visibility, "public")),
      orderBy: [asc(folders.position), asc(folders.title)],
    }),
    db.query.galleries.findMany({ where: eq(galleries.folderId, folder.id) }),
  ]);
  const visibleGalleries = childGalleries.filter((g) => g.publishedAt && g.visibility === "public");

  const [galleriesWithCovers, subsections] = await Promise.all([
    Promise.all(
      visibleGalleries.map(async (gallery) => {
        const coverAssetId =
          (gallery.coverAssetId &&
            (await db.query.assets.findFirst({ where: and(eq(assets.id, gallery.coverAssetId), isNull(assets.deletedAt)) }))
              ?.id) ??
          (
            await db.query.galleryItems.findFirst({
              where: eq(galleryItems.galleryId, gallery.id),
              orderBy: (gi, { asc: ascOrder }) => [ascOrder(gi.position)],
            })
          )?.assetId;

        // First couple of items in display order, so the hover-swap photo can be
        // "whichever of these isn't already the cover" -- no separate admin-curated
        // field, just the gallery's own next photo.
        const leadItems = await db.query.galleryItems.findMany({
          where: eq(galleryItems.galleryId, gallery.id),
          orderBy: (gi, { asc: ascOrder }) => [ascOrder(gi.position)],
          limit: 3,
        });
        const hoverAssetId = leadItems.find((it) => it.assetId !== coverAssetId)?.assetId;

        const [coverAsset, coverDerivative, hoverDerivative] = await Promise.all([
          coverAssetId ? db.query.assets.findFirst({ where: eq(assets.id, coverAssetId), columns: { lqip: true } }) : null,
          // "1200", not "400": these cover cards render across 1/2 to 1/4 of the page
          // width (folder-section-grid.tsx's 2/3/4-column grid), easily 300-450 CSS
          // px, which needed 600-900px of actual source on any retina display -- the
          // 400px derivative was stretched and soft here for the same reason the
          // photo grid was (just fixed separately in gallery-view.tsx).
          coverAssetId
            ? db.query.derivatives.findFirst({
                where: and(eq(derivatives.assetId, coverAssetId), eq(derivatives.variant, "1200"), eq(derivatives.format, "webp")),
              })
            : null,
          hoverAssetId
            ? db.query.derivatives.findFirst({
                where: and(eq(derivatives.assetId, hoverAssetId), eq(derivatives.variant, "1200"), eq(derivatives.format, "webp")),
              })
            : null,
        ]);

        return {
          ...gallery,
          coverUrl: coverDerivative ? publicDerivativeUrl(coverDerivative.storageKey) : null,
          coverLqip: coverAsset?.lqip ?? null,
          hoverUrl: hoverDerivative ? publicDerivativeUrl(hoverDerivative.storageKey) : null,
        };
      }),
    ),
    Promise.all(subfolders.map((sf) => loadFolderSection(sf))),
  ]);

  return { folder, galleries: galleriesWithCovers, subsections };
}

export type GalleryImage = {
  assetId: string;
  filename: string;
  kind: "raw" | "jpeg" | "heic" | "sidecar" | "video";
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
  storageKey: string; // Used for video playback; image urls come from derivatives
  /** Keyed as `${format}${variant}`, e.g. "avif400", "webp2560". */
  urls: Record<string, string>;
};

const SORT_COLUMN = {
  capture_date: assets.capturedAt,
  upload_date: assets.importedAt,
  filename: assets.originalFilename,
  manual: galleryItems.position,
} as const;

// filename/manual read naturally A-Z; the two date modes read naturally newest-first.
// gallery.sortDirection overrides this when set explicitly.
const DEFAULT_DIRECTION: Record<Gallery["sortMode"], "asc" | "desc"> = {
  capture_date: "desc",
  upload_date: "desc",
  filename: "asc",
  manual: "asc",
};

export async function loadGalleryImages(gallery: Gallery): Promise<GalleryImage[]> {
  const sortColumn = SORT_COLUMN[gallery.sortMode];
  const direction = gallery.sortDirection ?? DEFAULT_DIRECTION[gallery.sortMode];
  const rows = await db
    .select({
      assetId: assets.id,
      filename: assets.originalFilename,
      kind: assets.kind,
      width: assets.width,
      height: assets.height,
      lqip: assets.lqip,
      caption: galleryItems.caption,
      capturedAt: assets.capturedAt,
      storageKey: assets.storageKey,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleryItems.galleryId, gallery.id), isNull(assets.deletedAt)))
    .orderBy(direction === "asc" ? asc(sortColumn) : desc(sortColumn));

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
      kind: row.kind,
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
      storageKey: row.storageKey,
      urls,
    };
  });
}

/** Folder ids that are actually reachable by browsing from the root -- a folder whose
 * own visibility is "public" but sits inside a non-public ancestor (e.g. any of the
 * personal subfolders under the "Unlisted" root, which individually default to
 * "public" and only the root itself was deliberately hidden) is NOT publicly
 * reachable. Flat, cross-folder features (search, keyword browsing) query every
 * folder/gallery in the database directly rather than walking down from a public
 * root the way normal page navigation does, so checking a node's own visibility flag
 * alone silently leaked personal folder/gallery names through those features even
 * though browsing/homepage listings were correctly gated -- found via manual testing
 * of the search page, confirmed real (client wedding folder names appeared in
 * /search results despite the "Unlisted" root being hidden from the homepage). */
export async function publiclyReachableFolderIds(): Promise<Set<string>> {
  const rows = await db.execute<{ id: string }>(sql`
    with recursive reachable as (
      select id from ${folders} where parent_id is null and visibility = 'public'
      union all
      select f.id from ${folders} f
      join reachable r on f.parent_id = r.id
      where f.visibility = 'public'
    )
    select id from reachable
  `);
  return new Set(rows.map((r) => r.id));
}

/** Asset ids that appear in at least one public, published gallery whose folder is
 * also publicly reachable (see publiclyReachableFolderIds) -- the visibility boundary
 * for cross-gallery browsing (keyword cloud, search). Unlisted/password/private
 * galleries never surface here; that's the whole point of "unlisted". */
async function publiclyVisibleAssetIds(): Promise<string[]> {
  const reachable = await publiclyReachableFolderIds();
  const rows = await db
    .selectDistinct({ assetId: galleryItems.assetId, folderId: galleries.folderId })
    .from(galleryItems)
    .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleries.visibility, "public"), sql`${galleries.publishedAt} is not null`, isNull(assets.deletedAt)));
  return rows.filter((r) => reachable.has(r.folderId)).map((r) => r.assetId);
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
      kind: assets.kind,
      width: assets.width,
      height: assets.height,
      lqip: assets.lqip,
      capturedAt: assets.capturedAt,
      storageKey: assets.storageKey,
    })
    .from(assets)
    .where(and(inArray(assets.id, assetIds), isNull(assets.deletedAt)))
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
      kind: row.kind,
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
      storageKey: row.storageKey,
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

  const reachable = await publiclyReachableFolderIds();

  const [candidateFolders, candidateGalleries, matchedKeywords] = await Promise.all([
    db.query.folders.findMany({
      where: and(eq(folders.visibility, "public"), sql`(lower(${folders.title}) like ${pattern} or lower(coalesce(${folders.description}, '')) like ${pattern})`),
      limit: 50,
    }),
    db.query.galleries.findMany({
      where: and(
        eq(galleries.visibility, "public"),
        sql`${galleries.publishedAt} is not null`,
        sql`(lower(${galleries.title}) like ${pattern} or lower(coalesce(${galleries.description}, '')) like ${pattern})`,
      ),
      limit: 50,
    }),
    db
      .select({ value: keywords.value })
      .from(keywords)
      .where(sql`lower(${keywords.value}) like ${pattern}`)
      .limit(10),
  ]);

  // Own visibility is "public" on both, but that alone doesn't mean reachable -- see
  // publiclyReachableFolderIds for why a flat query like this needs the extra check
  // that normal folder-to-folder browsing gets for free.
  const matchedFolders = candidateFolders.filter((f) => reachable.has(f.id)).slice(0, 25);
  const matchedGalleries = candidateGalleries.filter((g) => reachable.has(g.folderId)).slice(0, 25);

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
