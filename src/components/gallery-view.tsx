"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { FocusFrame } from "./focus-frame";
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

// The grid used to always request the 400px derivative regardless of how wide the
// cell actually rendered -- fine at the "Small" row height, but a landscape photo at
// "Large" (420px row height, so often 600px+ wide once its aspect ratio is applied)
// was stretching a 400px source across 600+ CSS pixels, before accounting for
// retina displays needing roughly double that again. Pick the smallest available
// variant that still covers the rendered width at up to 2x pixel density, so a
// closely-matched crisp source is used without following through to the full 2560
// on every thumbnail.
function pickVariantForWidth(width: number): "400" | "1200" | "2560" {
  const target = width * 2;
  if (target <= 400) return "400";
  if (target <= 1200) return "1200";
  return "2560";
}

// How many grid items are plausibly visible in the first viewport (mobile-first,
// small galleries can fit several rows above the fold) -- these skip lazy loading
// and get fetchpriority hints; brief sections 8/15 want this only for "the hero,"
// but which single image Chrome treats as *the* LCP candidate isn't stable across
// runs once a wrapping grid is involved, so a small above-the-fold set is more robust
// than hard-coding index 0.
const EAGER_COUNT = 4;

// Row-height targets behind the small/medium/large toggle -- "medium" matches the
// grid's long-standing default so switching to it is a visual no-op.
const SIZE_OPTIONS = [
  { key: "small", label: "S", rowHeight: 160 },
  { key: "medium", label: "M", rowHeight: 260 },
  { key: "large", label: "L", rowHeight: 420 },
] as const;
type GridSize = (typeof SIZE_OPTIONS)[number]["key"];
const GRID_SIZE_STORAGE_KEY = "mm-gallery-grid-size";

function isGridSize(value: string | null): value is GridSize {
  return value === "small" || value === "medium" || value === "large";
}

export type PublicDownload = { galleryId: string; gallerySlug: string };

export function GalleryView({
  images,
  clientControls,
  showCameraInfo = true,
  showFilenames = false,
  slideshowEnabled = true,
  publicDownload,
}: {
  images: GalleryImage[];
  clientControls?: ClientGalleryControls;
  /** Per-gallery display toggles (Gallery Settings > Appearance) -- default to the
   * behavior these had before the toggle existed, so a caller that doesn't pass them
   * (the client-proofing page, if it ever stops threading them through) sees no
   * change. */
  showCameraInfo?: boolean;
  showFilenames?: boolean;
  slideshowEnabled?: boolean;
  /** Present only when the gallery's own "Allow downloads" setting (Photo Protection)
   * is on for ordinary visitors -- distinct from clientControls.downloadsEnabled,
   * which is the separate client-proofing-link permission. */
  publicDownload?: PublicDownload;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iParam = searchParams.get("i");
  const openIndex = iParam !== null ? Number(iParam) : null;
  const isOpen = openIndex !== null && openIndex >= 0 && openIndex < images.length;

  const [favorited, setFavorited] = useState<Set<string>>(new Set(clientControls?.initialFavorites));
  const [commentsByAsset, setCommentsByAsset] = useState<Record<string, CommentItem[]>>(
    clientControls?.initialComments ?? {},
  );

  // Defaults to "medium" during SSR/first paint, then syncs to whatever the visitor
  // last picked -- a per-browser preference, not per-gallery, so it should carry
  // across every gallery they visit.
  const [gridSize, setGridSize] = useState<GridSize>("medium");
  useEffect(() => {
    // localStorage doesn't exist during SSR, so the stored preference can only be
    // read post-mount -- this is exactly the "subscribe to an external system" case
    // the lint rule's own guidance carves out, not derived-state-from-props.
    const stored = localStorage.getItem(GRID_SIZE_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isGridSize(stored)) setGridSize(stored);
  }, []);
  const changeGridSize = useCallback((size: GridSize) => {
    setGridSize(size);
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, size);
  }, []);
  const targetRowHeight = SIZE_OPTIONS.find((o) => o.key === gridSize)!.rowHeight;

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
      <div className="mb-3 flex items-center justify-end gap-2">
        {publicDownload ? (
          <a
            href={`/api/public/gallery-download-zip?galleryId=${publicDownload.galleryId}`}
            className="rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
          >
            Download all
          </a>
        ) : null}
        <div role="group" aria-label="Image size" className="inline-flex rounded border border-neutral-200 bg-white p-0.5">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              aria-pressed={gridSize === opt.key}
              onClick={() => changeGridSize(opt.key)}
              title={`${opt.key[0].toUpperCase()}${opt.key.slice(1)} thumbnails`}
              className={`h-7 w-7 rounded text-xs tracking-wide transition-colors ${
                gridSize === opt.key ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <JustifiedGrid
        items={images.map((img) => ({ id: img.assetId, aspect: (img.width ?? 3) / (img.height ?? 2) }))}
        targetRowHeight={targetRowHeight}
        gap={4}
        renderItem={(_gridItem, width, height, index) => {
          const image = images[index];
          const src = pickSrc(image.urls, pickVariantForWidth(width));
          const isEager = index < EAGER_COUNT;
          const isVideo = image.kind === "video";
          return (
            <button
              type="button"
              onClick={() => setIndex(index)}
              className="group relative block h-full w-full overflow-hidden bg-neutral-100"
              data-cursor="view"
              style={{ width, height, backgroundImage: image.lqip ? `url(${image.lqip})` : undefined, backgroundSize: "cover" }}
            >
              {!isVideo ? (
                <picture>
                  {src.avif ? <source srcSet={src.avif} type="image/avif" /> : null}
                  {src.webp ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src.webp}
                      alt={image.caption ?? image.filename}
                      loading={isEager ? "eager" : "lazy"}
                      fetchPriority={isEager ? "high" : undefined}
                      className={`focus-image h-full w-full object-cover ${isEager ? "" : "opacity-0 transition-opacity duration-500 ease-out [&.is-loaded]:opacity-100"}`}
                      onLoad={isEager ? undefined : (e) => e.currentTarget.classList.add("is-loaded")}
                    />
                  ) : null}
                </picture>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-white/50">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              <FocusFrame />
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
          showCameraInfo={showCameraInfo}
          showFilenames={showFilenames}
          slideshowEnabled={slideshowEnabled}
          publicDownload={publicDownload}
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
