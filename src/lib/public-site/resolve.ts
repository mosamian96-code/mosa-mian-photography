import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, derivatives, folders, galleries, galleryItems } from "@/lib/db/schema";
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

  return rows.map((row) => {
    const derivativesForAsset = allDerivatives.filter((d) => d.assetId === row.assetId);
    const urls: Record<string, string> = {};
    for (const d of derivativesForAsset) {
      urls[`${d.format}${d.variant}`] = publicDerivativeUrl(d.storageKey);
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
      urls,
    };
  });
}
