import { cookies } from "next/headers";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClientAccessEmailForm } from "@/components/client-access-email-form";
import { ClientAccessPasswordForm } from "@/components/client-access-password-form";
import { GalleryView, type CommentItem } from "@/components/gallery-view";
import { db } from "@/lib/db";
import { clientAccess, comments, favorites, galleries } from "@/lib/db/schema";
import { clientAccessSessionCookieName, verifyClientAccessToken } from "@/lib/public-site/client-access-auth";
import { loadGalleryImages } from "@/lib/public-site/resolve";

export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ClientGalleryPage({ params }: Props) {
  const { token } = await params;

  const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.token, token) });
  if (!link) notFound();

  const isExpired = Boolean(link.expiresAt && link.expiresAt < new Date());
  if (link.revokedAt || isExpired) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg text-neutral-900" style={{ fontFamily: "var(--font-display)" }}>
          This link is no longer available
        </h1>
        <p className="mt-2 text-sm text-neutral-500">Ask your photographer for a new one.</p>
      </main>
    );
  }

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, link.galleryId) });
  if (!gallery) notFound();

  if (link.passwordHash) {
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(clientAccessSessionCookieName(link.id))?.value;
    if (!verifyClientAccessToken(link.id, cookieToken)) {
      return <ClientAccessPasswordForm token={token} />;
    }
  }

  if (!link.email) {
    return <ClientAccessEmailForm token={token} galleryTitle={gallery.title} />;
  }

  const [images, favoriteRows, commentRows] = await Promise.all([
    loadGalleryImages(gallery),
    db.query.favorites.findMany({ where: eq(favorites.clientAccessId, link.id) }),
    db.query.comments.findMany({ where: eq(comments.clientAccessId, link.id) }),
  ]);

  const initialComments: Record<string, CommentItem[]> = {};
  for (const c of commentRows) {
    (initialComments[c.assetId] ??= []).push({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString() });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
        {gallery.title}
      </h1>
      {gallery.description ? <p className="mt-2 max-w-2xl text-sm text-neutral-500">{gallery.description}</p> : null}
      <div className="mt-6">
        {images.length > 0 ? (
          <GalleryView
            images={images}
            showCameraInfo={gallery.showCameraInfo}
            showFilenames={gallery.showFilenames}
            slideshowEnabled={gallery.slideshowEnabled}
            clientControls={{
              clientAccessId: link.id,
              canFavorite: link.canFavorite,
              canComment: link.canComment,
              downloadsEnabled: link.downloadsEnabled && gallery.downloadsPolicy !== "off",
              initialFavorites: favoriteRows.map((f) => f.assetId),
              initialComments,
            }}
          />
        ) : (
          <p className="text-sm text-neutral-400">This gallery is empty.</p>
        )}
      </div>
    </main>
  );
}
