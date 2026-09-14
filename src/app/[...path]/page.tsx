import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import { FolderSectionGrid } from "@/components/folder-section-grid";
import { GalleryPasswordForm } from "@/components/gallery-password-form";
import GalleryMap from "@/components/gallery-map-loader";
import { GalleryView } from "@/components/gallery-view";
import { PublicShell } from "@/components/public-shell";
import { RightClickGuard } from "@/components/right-click-guard";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
import { gallerySessionCookieName, verifyGalleryToken } from "@/lib/public-site/gallery-auth";
import { loadGalleryImages, resolvePath } from "@/lib/public-site/resolve";

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const resolved = await resolvePath(path);
  if (!resolved) return {};

  if (resolved.type === "gallery") {
    return {
      title: `${resolved.gallery.title} — Mosa Mian Photography`,
      description: resolved.gallery.description ?? `Photos from ${resolved.gallery.title} — Mosa Mian Photography.`,
      keywords: resolved.gallery.metaKeywords || undefined,
      robots: resolved.gallery.visibility === "public" && resolved.gallery.searchable ? undefined : { index: false },
    };
  }
  return {
    title: `${resolved.folder.title} — Mosa Mian Photography`,
    description: resolved.folder.description ?? `${resolved.folder.title} — Mosa Mian Photography.`,
    robots: resolved.folder.visibility === "public" ? undefined : { index: false },
  };
}

function Breadcrumb({ trail }: { trail: { title: string; href: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500">
      <Link href="/" className="hover:text-neutral-900">
        Home
      </Link>
      {trail.map((t) => (
        <span key={t.href} className="flex items-center gap-1">
          <span>/</span>
          <Link href={t.href} className="hover:text-neutral-900">
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
      if (!verifyGalleryToken(gallery.id, token)) {
        return <GalleryPasswordForm galleryId={gallery.id} />;
      }
    }

    const images = await loadGalleryImages(gallery);
    const hasGeotagged = images.some((img) => img.gpsLat != null && img.gpsLon != null);

    const content = (
      <PublicShell>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Breadcrumb trail={trail} />
          <div style={{ animation: "reveal-up var(--dur-slow) var(--ease-settle) both" }}>
            <h1
              className="mt-4 text-2xl text-neutral-900"
              style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
            >
              {gallery.title}
            </h1>
            {gallery.description ? <p className="mt-2 max-w-2xl text-sm text-neutral-500">{gallery.description}</p> : null}
          </div>
          {hasGeotagged && gallery.mapEnabled ? <GalleryMap images={images} /> : null}
          <div className="mt-6">
            {images.length > 0 ? (
              <GalleryView
                images={images}
                showCameraInfo={gallery.showCameraInfo}
                showFilenames={gallery.showFilenames}
                slideshowEnabled={gallery.slideshowEnabled}
                publicDownload={
                  gallery.publicDownloadsPolicy !== "off"
                    ? { galleryId: gallery.id, gallerySlug: gallery.slug }
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
