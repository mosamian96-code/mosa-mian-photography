import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import { FolderSectionGrid } from "@/components/folder-section-grid";
import { GalleryCover } from "@/components/gallery-cover";
import { GalleryPasswordForm } from "@/components/gallery-password-form";
import GalleryMap from "@/components/gallery-map-loader";
import { GalleryView } from "@/components/gallery-view";
import { PublicShell } from "@/components/public-shell";
import { RightClickGuard } from "@/components/right-click-guard";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
import { gallerySessionCookieName, verifyGalleryToken } from "@/lib/public-site/gallery-auth";
import { formatCaptureRange, pickCoverImage } from "@/lib/public-site/gallery-cover";
import { firstCoverUrl, loadGalleryImages, resolvePath } from "@/lib/public-site/resolve";
import { SITE_NAME, shareMetadata } from "@/lib/public-site/seo";
import { countGalleryStat, isCountableView } from "@/lib/gallery-stats";

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const resolved = await resolvePath(path);
  if (!resolved) return {};
  const pagePath = "/" + path.map(encodeURIComponent).join("/");

  if (resolved.type === "gallery") {
    const { gallery } = resolved;
    const title = `${gallery.title} — ${SITE_NAME}`;
    const description = gallery.description || `Photos from ${gallery.title} by Mosa Mian.`;
    // A password gallery's preview must not show what the password protects; public
    // and unlisted galleries share their cover (the same image the page opens with).
    let image: { url: string; width: number | null; height: number | null } | null = null;
    if (gallery.visibility !== "password") {
      const cover = pickCoverImage(await loadGalleryImages(gallery), gallery.coverAssetId);
      const url = cover?.urls.jpeg2560 ?? cover?.urls.webp1200 ?? null;
      if (cover && url) image = { url, width: cover.width, height: cover.height };
    }
    return {
      title,
      description,
      keywords: gallery.metaKeywords || undefined,
      robots: gallery.visibility === "public" && gallery.searchable ? undefined : { index: false },
      ...shareMetadata({ title, description, path: pagePath, image }),
    };
  }

  const title = `${resolved.folder.title} — ${SITE_NAME}`;
  const description = resolved.folder.description || `${resolved.folder.title}: galleries by Mosa Mian.`;
  const firstCover = firstCoverUrl(resolved.section);
  return {
    title,
    description,
    robots: resolved.folder.visibility === "public" ? undefined : { index: false },
    ...shareMetadata({ title, description, path: pagePath, image: firstCover ? { url: firstCover } : null }),
  };
}

function Breadcrumb({ trail }: { trail: { title: string; href: string }[] }) {
  return (
    // py-3/-my-3 gives each link a 44px-tall tap area without moving the layout.
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-neutral-500">
      <Link href="/" className="-my-3 py-3 hover:text-neutral-900">
        Home
      </Link>
      {trail.map((t) => (
        <span key={t.href} className="flex items-center gap-1">
          <span>/</span>
          <Link href={t.href} className="-my-3 py-3 hover:text-neutral-900">
            {t.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export default async function PublicPathPage({ params }: Props) {
  const { path } = await params;
  const resolved = await resolvePath(path);
  if (!resolved) {
    // Old SmugMug links clients already have (brief section 14 step 3) -- checked only
    // on an otherwise-404 path, so it costs nothing on the hot path of a normal visit.
    const oldPath = "/" + path.join("/");
    const match = await db.query.redirects.findFirst({ where: eq(redirects.oldPath, oldPath) });
    if (match) permanentRedirect(match.newPath);
    notFound();
  }

  const trail = resolved.breadcrumb.map((f, i) => ({
    title: f.title,
    href: "/" + resolved.breadcrumb.slice(0, i + 1).map((b) => b.slug).join("/"),
  }));

  if (resolved.type === "gallery") {
    const { gallery } = resolved;

    if (gallery.visibility === "password") {
      const cookieStore = await cookies();
      const token = cookieStore.get(gallerySessionCookieName(gallery.id))?.value;
      if (!verifyGalleryToken(gallery, token)) {
        return <GalleryPasswordForm galleryId={gallery.id} />;
      }
    }

    // Read before after(): request data isn't available inside it in a page.
    if (isCountableView(await headers())) countGalleryStat(gallery.id, "views");

    const images = await loadGalleryImages(gallery);
    const hasGeotagged = images.some((img) => img.gpsLat != null && img.gpsLon != null);
    const cover = pickCoverImage(images, gallery.coverAssetId);

    const content = (
      <PublicShell>
        {cover ? (
          <GalleryCover
            title={gallery.title}
            dateLabel={formatCaptureRange(images.map((img) => img.capturedAt))}
            image={cover}
            fill="below-nav"
          />
        ) : null}
        {/* scroll-mt is the sticky navigation bar's height (61px with its border), so
            "View gallery" stops with the cover fully tucked under the bar -- no sliver of
            it showing between the bar and the photos. */}
        <div id="photos" className="mx-auto max-w-6xl scroll-mt-[60px] px-4 py-8">
          <Breadcrumb trail={trail} />
          <div style={{ animation: "reveal-up var(--dur-slow) var(--ease-settle) both" }}>
            {cover ? null : (
              <h1
                className="mt-4 text-2xl text-neutral-900"
                style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
              >
                {gallery.title}
              </h1>
            )}
            {gallery.description ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">{gallery.description}</p>
            ) : null}
          </div>
          {hasGeotagged && gallery.mapEnabled ? <GalleryMap images={images} /> : null}
          <div className="mt-6">
            {images.length > 0 ? (
              <GalleryView
                images={images}
                showCameraInfo={gallery.showCameraInfo}
                showFilenames={gallery.showFilenames}
                slideshowEnabled={gallery.slideshowEnabled}
                belowCover={cover !== null}
                galleryId={gallery.id}
                publicDownload={
                  gallery.publicDownloadsPolicy !== "off"
                    ? {
                        galleryId: gallery.id,
                        gallerySlug: gallery.slug,
                        fullResolution: gallery.publicDownloadsPolicy === "original",
                      }
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-neutral-400">This gallery is empty.</p>
            )}
          </div>
        </div>
      </PublicShell>
    );

    return gallery.rightClickMessage ? (
      <RightClickGuard message={gallery.rightClickMessage}>{content}</RightClickGuard>
    ) : (
      content
    );
  }

  const { folder, section } = resolved;
  const isEmpty = section.galleries.length === 0 && section.subsections.length === 0;

  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Breadcrumb trail={trail} />
        <div style={{ animation: "reveal-up var(--dur-slow) var(--ease-settle) both" }}>
          <h1 className="mt-4 text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}>
            {folder.title}
          </h1>
          {folder.description ? <p className="mt-2 max-w-2xl text-sm text-neutral-500">{folder.description}</p> : null}
        </div>

        {isEmpty ? (
          <p className="mt-8 text-sm text-neutral-400">Nothing published here yet.</p>
        ) : (
          <FolderSectionGrid section={section} pathSegments={path} depth={0} />
        )}
      </div>
    </PublicShell>
  );
}
