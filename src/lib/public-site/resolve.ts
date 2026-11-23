import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { assetKeywords, assets, derivatives, folders, galleries, galleryItems, keywords } from "@/lib/db/schema";
import { buildFolderPaths } from "@/lib/public-site/folder-paths";
import { publicDerivativeUrl } from "@/lib/storage";

type Folder = typeof folders.$inferSelect;
type Gallery = typeof galleries.$inferSelect;

/** Only what a cover card shows -- this is serialized into the page for every
 * visitor, so whole gallery rows (descriptions, settings) don't ride along. */
export type GalleryCard = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  coverSrcSet: string | null;
  coverAvifSrcSet: string | null;
  coverLqip: string | null;
  coverAspect: number;
  hoverUrl: string | null;
  hoverSrcSet: string | null;
};

export type FolderSection = {
  folder: Folder;
  galleries: GalleryCard[];
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
export function resolvePath(segments: string[]): Promise<ResolvedFolder | ResolvedGallery | null> {
  return resolvePathCached(JSON.stringify(segments));
}

// React's cache() compares arguments by identity, and generateMetadata and the page
// each get their own params array, so the cache key is the path as a string. Without
// this every folder page resolved (and built its whole cover grid) twice per request.
const resolvePathCached = cache((key: string) => resolvePathUncached(JSON.parse(key) as string[]));

async function resolvePathUncached(segments: string[]): Promise<ResolvedFolder | ResolvedGallery | null> {
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
 * every level, same as the old flat version.
 *
 * Batched: a fixed handful of queries for the whole subtree. This used to run 3-5
 * queries per gallery, all at once, against a 10-connection pool -- fine for a few
 * dozen galleries, but a folder holding hundreds (the SmugMug import has ~640 albums)
 * would have queued every other page behind it. */
async function loadFolderSection(root: Folder): Promise<FolderSection> {
  // The folder table is small (hundreds of rows), so one read of every public folder
  // is cheaper than walking the tree level by level.
  const publicFolders = await db.query.folders.findMany({
    where: eq(folders.visibility, "public"),
    orderBy: [asc(folders.position), asc(folders.title)],
  });
  const childrenOf = new Map<string, Folder[]>();
  for (const f of publicFolders) {
    if (!f.parentId) continue;
    const siblings = childrenOf.get(f.parentId) ?? [];
    siblings.push(f);
    childrenOf.set(f.parentId, siblings);
  }
  const subtreeIds: string[] = [];
  const visit = (id: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    subtreeIds.push(id);
    for (const child of childrenOf.get(id) ?? []) visit(child.id, seen);
  };
  visit(root.id, new Set());

  const visibleGalleries = await db.query.galleries.findMany({
    where: and(inArray(galleries.folderId, subtreeIds), eq(galleries.visibility, "public"), isNotNull(galleries.publishedAt)),
    // position first (the studio's manual order); created_at keeps galleries that
    // were never reordered in the order they were made, as before.
    orderBy: [asc(galleries.position), asc(galleries.createdAt)],
  });
  const cards = await galleryCards(visibleGalleries);

  const build = (folder: Folder, seen: Set<string>): FolderSection => {
    seen.add(folder.id);
    return {
      folder,
      galleries: visibleGalleries.filter((g) => g.folderId === folder.id).map((g) => cards.get(g.id)!),
      subsections: (childrenOf.get(folder.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => build(c, seen)),
    };
  };
  return build(root, new Set());
}

/** Cover-card data for a set of galleries: cover photo (the chosen cover, or the first
 * photo when none is set or it was deleted), a hover photo (the next photo that isn't
 * the cover), and the 400/1200 derivatives of each. Watermarked galleries get only
 * watermarked versions. */
async function galleryCards(list: Gallery[]): Promise<Map<string, GalleryCard>> {
  const result = new Map<string, GalleryCard>();
  if (list.length === 0) return result;
  const galleryIds = list.map((g) => g.id);

  // First three photos of every gallery in display order, in one query.
  const leadRows = await db.execute<{ gallery_id: string; asset_id: string }>(sql`
    select gallery_id, asset_id from (
      select gallery_id, asset_id,
        row_number() over (partition by gallery_id order by position) as rn
      from ${galleryItems}
      where ${inArray(galleryItems.galleryId, galleryIds)}
    ) ranked
    where rn <= 3
    order by gallery_id, rn
  `);
  const leadByGallery = new Map<string, string[]>();
  for (const row of leadRows) {
    const lead = leadByGallery.get(row.gallery_id) ?? [];
    lead.push(row.asset_id);
    leadByGallery.set(row.gallery_id, lead);
  }

  const candidateIds = new Set<string>();
  for (const g of list) {
    if (g.coverAssetId) candidateIds.add(g.coverAssetId);
    for (const id of leadByGallery.get(g.id) ?? []) candidateIds.add(id);
  }
  const assetRows = candidateIds.size
    ? await db.query.assets.findMany({
        where: inArray(assets.id, [...candidateIds]),
        columns: { id: true, lqip: true, width: true, height: true, deletedAt: true },
      })
    : [];
  const assetById = new Map(assetRows.map((a) => [a.id, a]));

  const picks = list.map((g) => {
    const lead = leadByGallery.get(g.id) ?? [];
    const chosen = g.coverAssetId ? assetById.get(g.coverAssetId) : undefined;
    const coverId = chosen && !chosen.deletedAt ? chosen.id : lead[0];
    const hoverId = lead.find((id) => id !== coverId);
    return { gallery: g, coverId, hoverId };
  });

  const imageIds = [...new Set(picks.flatMap((p) => [p.coverId, p.hoverId]).filter((id): id is string => Boolean(id)))];
  const derivativeRows = imageIds.length
    ? await db.query.derivatives.findMany({
        where: and(inArray(derivatives.assetId, imageIds), inArray(derivatives.variant, ["400", "1200"])),
        columns: { assetId: true, variant: true, format: true, width: true, watermarked: true, storageKey: true },
      })
    : [];

  for (const { gallery, coverId, hoverId } of picks) {
    const watermarked = Boolean(gallery.watermarkId);
    const versions = (assetId: string | undefined) =>
      assetId ? derivativeRows.filter((d) => d.assetId === assetId && d.watermarked === watermarked) : [];
    const cover = versions(coverId);
    const hover = versions(hoverId);
    const coverAsset = coverId ? assetById.get(coverId) : undefined;

    result.set(gallery.id, {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      // "1200", not "400", as the fallback src: these cards render 300-450 CSS px
      // wide, which needs 600-900px of source on a retina screen. The srcsets let
      // the browser pick 400 for small tiles on ordinary screens.
      coverUrl: urlFor(cover, "webp", "1200"),
      coverSrcSet: srcSetFor(cover, "webp"),
      coverAvifSrcSet: srcSetFor(cover, "avif"),
      coverLqip: coverAsset?.lqip ?? null,
      // Falls back to 3/2 (a common landscape-photo ratio) only when width/height
      // are missing entirely -- every asset that's finished processing has them,
      // this just avoids a divide-by-zero for the rare not-yet-ready cover.
      coverAspect: coverAsset?.width && coverAsset?.height ? coverAsset.width / coverAsset.height : 1.5,
      hoverUrl: urlFor(hover, "webp", "1200"),
      hoverSrcSet: srcSetFor(hover, "webp"),
    });
  }
  return result;
}

/** The first cover photo in a folder's tree, depth-first -- the folder's share image. */
export function firstCoverUrl(section: FolderSection): string | null {
  for (const card of section.galleries) if (card.coverUrl) return card.coverUrl;
  for (const sub of section.subsections) {
    const url = firstCoverUrl(sub);
    if (url) return url;
  }
  return null;
}

type DerivativeRef = { variant: string; format: string; width: number | null; storageKey: string };

function urlFor(list: DerivativeRef[], format: string, variant: string) {
  const d = list.find((x) => x.format === format && x.variant === variant);
  return d ? publicDerivativeUrl(d.storageKey) : null;
}

/** "url 400w, url 1200w" from whichever sizes exist. Uses the derivative's real width
 * when known: a photo smaller than 1200px wide has a "1200" derivative that isn't. */
function srcSetFor(list: DerivativeRef[], format: string) {
  const parts = list
    .filter((d) => d.format === format)
    .sort((a, b) => Number(a.variant) - Number(b.variant))
    .map((d) => `${publicDerivativeUrl(d.storageKey)} ${d.width ?? Number(d.variant)}w`);
  return parts.length ? parts.join(", ") : null;
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
  /** Null unless the gallery's map is on -- every field here is serialized into the
   * page for anyone who opens it, and a client's wedding at home would otherwise
   * publish the home's exact location. */
  gpsLat: number | null;
  gpsLon: number | null;
  /** Keyed as `${format}${variant}`, e.g. "avif400", "webp2560". Empty while a
   * watermarked gallery's watermarked versions are still being generated. */
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

/** The gallery fields that decide what loadGalleryImages returns. */
type ImageSettings = Pick<Gallery, "id" | "sortMode" | "sortDirection" | "watermarkId" | "showCameraInfo" | "mapEnabled">;

/** A gallery's photos, cached per request so the page and its share metadata load
 * them once. React's cache() matches arguments by identity, hence plain values. */
export function loadGalleryImages(gallery: ImageSettings): Promise<GalleryImage[]> {
  return loadGalleryImagesCached(
    gallery.id,
    gallery.sortMode,
    gallery.sortDirection,
    gallery.watermarkId,
    gallery.showCameraInfo,
    gallery.mapEnabled,
  );
}

const loadGalleryImagesCached = cache(
  (
    id: string,
    sortMode: Gallery["sortMode"],
    sortDirection: Gallery["sortDirection"],
    watermarkId: string | null,
    showCameraInfo: boolean,
    mapEnabled: boolean,
  ) => loadGalleryImagesUncached({ id, sortMode, sortDirection, watermarkId, showCameraInfo, mapEnabled }),
);

async function loadGalleryImagesUncached(gallery: ImageSettings): Promise<GalleryImage[]> {
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

  // A watermarked gallery serves only watermarked derivatives -- never the clean ones,
  // not even as a fallback while the watermark job is still running (that photo shows
  // its blurred placeholder until then). Its URLs carry a random per-generation token
  // rather than the content hash (see watermarkedKey), so a visitor can't derive the
  // clean URL from the watermarked one.
  const useWatermark = Boolean(gallery.watermarkId);

  return rows.map((row) => {
    const urls: Record<string, string> = {};
    for (const d of allDerivatives) {
      if (d.assetId === row.assetId && d.watermarked === useWatermark) {
        urls[`${d.format}${d.variant}`] = publicDerivativeUrl(d.storageKey);
      }
    }
    const meta = metaByAsset.get(row.assetId);
    const camera = gallery.showCameraInfo ? meta : undefined;
    const location = gallery.mapEnabled ? meta : undefined;
    return {
      assetId: row.assetId,
      filename: row.filename,
      kind: row.kind,
      width: row.width,
      height: row.height,
      lqip: row.lqip,
      caption: row.caption,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      camera: camera?.camera ?? null,
      lens: camera?.lens ?? null,
      iso: camera?.iso ?? null,
      shutter: camera?.shutter ?? null,
      aperture: camera?.aperture ?? null,
      gpsLat: location?.gpsLat ?? null,
      gpsLon: location?.gpsLon ?? null,
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

/** Asset ids that appear in at least one public, published, unwatermarked gallery
 * whose folder is also publicly reachable (see publiclyReachableFolderIds) -- the
 * visibility boundary for cross-gallery browsing (keyword cloud, search), which shows
 * clean derivatives. Unlisted/password/private galleries never surface here; that's
 * the whole point of "unlisted". A photo shown only in watermarked galleries is
 * excluded too, or keyword pages would publish the clean version its galleries hide. */
async function publiclyVisibleAssetIds(): Promise<string[]> {
  const reachable = await publiclyReachableFolderIds();
  const rows = await db
    .selectDistinct({ assetId: galleryItems.assetId, folderId: galleries.folderId })
    .from(galleryItems)
    .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(
      and(
        eq(galleries.visibility, "public"),
        sql`${galleries.publishedAt} is not null`,
        isNull(galleries.watermarkId),
        isNull(assets.deletedAt),
      ),
    );
  return rows.filter((r) => reachable.has(r.folderId)).map((r) => r.assetId);
}

/** One asset's answer to publiclyVisibleAssetIds, without loading every id -- for
 * authorizing a single request from a cross-gallery page (a keyword page's video). */
export async function isPubliclyVisibleAsset(assetId: string): Promise<boolean> {
  const [reachable, rows] = await Promise.all([
    publiclyReachableFolderIds(),
    db
      .selectDistinct({ folderId: galleries.folderId })
      .from(galleryItems)
      .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
      .where(
        and(
          eq(galleryItems.assetId, assetId),
          eq(galleries.visibility, "public"),
          sql`${galleries.publishedAt} is not null`,
          isNull(galleries.watermarkId),
        ),
      ),
  ]);
  return rows.some((r) => reachable.has(r.folderId));
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
 * a cross-gallery aggregate with clean derivatives, limited to photos some public,
 * unwatermarked gallery already shows clean (see publiclyVisibleAssetIds).
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
      // Cross-gallery views have no map to justify publishing coordinates.
      gpsLat: null,
      gpsLon: null,
      urls,
    };
  });
}

export type SearchResults = {
  folders: (Folder & { path: string })[];
  galleries: (Gallery & { path: string })[];
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
  // Every result links by its full path from the root (see buildFolderPaths): one
  // query for the public folder tree instead of one per result.
  const publicFolders = await db.query.folders.findMany({
    where: eq(folders.visibility, "public"),
    columns: { id: true, parentId: true, slug: true },
  });
  const folderPaths = buildFolderPaths(publicFolders);

  const matchedFolders = candidateFolders
    .filter((f) => reachable.has(f.id) && folderPaths.has(f.id))
    .slice(0, 25)
    .map((f) => ({ ...f, path: folderPaths.get(f.id)! }));
  const galleriesWithPath = candidateGalleries
    .filter((g) => reachable.has(g.folderId) && folderPaths.has(g.folderId))
    .slice(0, 25)
    .map((g) => ({ ...g, path: `${folderPaths.get(g.folderId)}/${g.slug}` }));

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
