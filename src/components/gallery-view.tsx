"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { JustifiedGrid } from "./justified-grid";
import type { GalleryImage } from "@/lib/public-site/resolve";

export type CommentItem = { id: string; body: string; createdAt: string };

/** Present only on client-proofing galleries (/g/[token]) — undefined on the plain
 * public site, which keeps favorite/comment/download UI out of that bundle entirely. */
export type ClientGalleryControls = {
  clientAccessId: string;
  canFavorite: boolean;
  canComment: boolean;
  downloadsEnabled: boolean;
  initialFavorites: string[];
  initialComments: Record<string, CommentItem[]>;
};

// Keyboard nav, slideshow, swipe, and neighbor preloading are real code weight that
// has no reason to be part of what every visitor hydrates just to see the grid --
// only loaded once a photo is actually opened. ssr:false since it's purely an
// interaction layer with no content of its own to render server-side.
const Lightbox = dynamic(() => import("./lightbox"), { ssr: false });

function pickSrc(urls: Record<string, string>, variant: string) {
  return { avif: urls[`avif${variant}`], webp: urls[`webp${variant}`] };
}

// How many grid items are plausibly visible in the first viewport (mobile-first,
// small galleries can fit several rows above the fold) -- these skip lazy loading
// and get fetchpriority hints; brief sections 8/15 want this only for "the hero,"
// but which single image Chrome treats as *the* LCP candidate isn't stable across
// runs once a wrapping grid is involved, so a small above-the-fold set is more robust
// than hard-coding index 0.
const EAGER_COUNT = 4;

export function GalleryView({ images, clientControls }: { images: GalleryImage[]; clientControls?: ClientGalleryControls }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iParam = searchParams.get("i");
  const openIndex = iParam !== null ? Number(iParam) : null;
  const isOpen = openIndex !== null && openIndex >= 0 && openIndex < images.length;

  const [favorited, setFavorited] = useState<Set<string>>(new Set(clientControls?.initialFavorites));
  const [commentsByAsset, setCommentsByAsset] = useState<Record<string, CommentItem[]>>(
    clientControls?.initialComments ?? {},
  );

  const setIndex = useCallback(
    (index: number | null) => {
      const params = new URLSearchParams(searchParams);
      if (index === null) params.delete("i");
      else params.set("i", String(index));
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const toggleFavorite = useCallback(
    async (assetId: string) => {
      if (!clientControls) return;
      setFavorited((prev) => {
        const next = new Set(prev);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      });
      await fetch("/api/public/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientAccessId: clientControls.clientAccessId, assetId }),
      });
    },
    [clientControls],
  );

  const addComment = useCallback(
    async (assetId: string, body: string) => {
      if (!clientControls) return;
      const res = await fetch("/api/public/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientAccessId: clientControls.clientAccessId, assetId, body }),
      });
      if (!res.ok) return;
      const comment = (await res.json()) as CommentItem;
      setCommentsByAsset((prev) => ({ ...prev, [assetId]: [...(prev[assetId] ?? []), comment] }));
    },
    [clientControls],
  );

  return (
    <>
      <JustifiedGrid
        items={images.map((img) => ({ id: img.assetId, aspect: (img.width ?? 3) / (img.height ?? 2) }))}
        targetRowHeight={260}
        gap={4}
        renderItem={(_gridItem, width, height, index) => {
          const image = images[index];
          const src = pickSrc(image.urls, "400");
          const isEager = index < EAGER_COUNT;
          return (
            <button
              type="button"
              onClick={() => setIndex(index)}
              className="relative block h-full w-full overflow-hidden bg-neutral-100 transition-opacity hover:opacity-90"
              style={{ width, height, backgroundImage: image.lqip ? `url(${image.lqip})` : undefined, backgroundSize: "cover" }}
            >
              <picture>
                {src.avif ? <source srcSet={src.avif} type="image/avif" /> : null}
                {src.webp ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src.webp}
                    alt={image.caption ?? image.filename}
                    loading={isEager ? "eager" : "lazy"}
                    fetchPriority={isEager ? "high" : undefined}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </picture>
              {clientControls?.canFavorite && favorited.has(image.assetId) ? (
                <span className="absolute right-1.5 top-1.5 text-sm text-white drop-shadow">♥</span>
              ) : null}
            </button>
          );
        }}
      />

      {isOpen && openIndex !== null ? (
        <Lightbox
          images={images}
          index={openIndex}
          onClose={() => setIndex(null)}
          onNavigate={setIndex}
          clientControls={
            clientControls
              ? {
                  clientAccessId: clientControls.clientAccessId,
                  canFavorite: clientControls.canFavorite,
                  canComment: clientControls.canComment,
                  downloadsEnabled: clientControls.downloadsEnabled,
                  favorited,
                  onToggleFavorite: toggleFavorite,
                  commentsByAsset,
                  onAddComment: addComment,
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
