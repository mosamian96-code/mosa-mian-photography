"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImage } from "@/lib/public-site/resolve";
import type { CommentItem } from "./gallery-view";

type LightboxClientControls = {
  clientAccessId: string;
  canFavorite: boolean;
  canComment: boolean;
  downloadsEnabled: boolean;
  favorited: Set<string>;
  onToggleFavorite: (assetId: string) => void;
  commentsByAsset: Record<string, CommentItem[]>;
  onAddComment: (assetId: string, body: string) => void;
};

function pickSrc(urls: Record<string, string>, variant: string) {
  return { avif: urls[`avif${variant}`], webp: urls[`webp${variant}`] };
}

function ClientProofingPanel({
  assetId,
  controls,
}: {
  assetId: string;
  controls: LightboxClientControls;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const assetComments = controls.commentsByAsset[assetId] ?? [];

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    await controls.onAddComment(assetId, draft.trim());
    setSubmitting(false);
    setDraft("");
  }

  return (
    <div className="mt-3 flex w-full max-w-xl flex-col items-center gap-2 text-sm">
      <div className="flex items-center gap-4">
        {controls.canFavorite ? (
          <button
            type="button"
            onClick={() => controls.onToggleFavorite(assetId)}
            className="flex items-center gap-1 text-white/70 hover:text-white"
          >
            <span className={controls.favorited.has(assetId) ? "text-red-400" : ""}>
              {controls.favorited.has(assetId) ? "♥" : "♡"}
            </span>
            Favorite
          </button>
        ) : null}
        {controls.downloadsEnabled ? (
          <a
            href={`/api/public/download?clientAccessId=${controls.clientAccessId}&assetId=${assetId}`}
            className="text-white/70 hover:text-white"
          >
            Download
          </a>
        ) : null}
      </div>

      {controls.canComment ? (
        <div className="w-full">
          {assetComments.length > 0 ? (
            <ul className="mb-2 max-h-24 w-full space-y-1 overflow-y-auto text-left text-xs text-white/70">
              {assetComments.map((c) => (
                <li key={c.id}>{c.body}</li>
              ))}
            </ul>
          ) : null}
          <form onSubmit={submitComment} className="flex w-full gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Leave a comment…"
              className="flex-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/50"
            />
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function exifLine(image: GalleryImage) {
  return [image.camera, image.lens, image.aperture, image.shutter, image.iso ? `ISO ${image.iso}` : null]
    .filter(Boolean)
    .join("  ·  ");
}

const SLIDESHOW_INTERVAL_MS = 4000;

// Loaded via next/dynamic({ ssr:false }) from GalleryView, only once a photo is
// actually opened -- keyboard nav, slideshow, swipe, and neighbor preloading have no
// reason to be part of the JS every visitor hydrates just to see the grid.
export default function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
  clientControls,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  clientControls?: LightboxClientControls;
}) {
  const [slideshowOn, setSlideshowOn] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goNext = useCallback(() => onNavigate((index + 1) % images.length), [index, images.length, onNavigate]);
  const goPrev = useCallback(
    () => onNavigate((index - 1 + images.length) % images.length),
    [index, images.length, onNavigate],
  );
  const close = useCallback(() => {
    onClose();
    setSlideshowOn(false);
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, close]);

  useEffect(() => {
    for (const offset of [1, -1]) {
      const neighbor = images[(index + offset + images.length) % images.length];
      const src = pickSrc(neighbor.urls, "2560").webp;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    }
  }, [index, images]);

  useEffect(() => {
    if (!slideshowOn) return;
    const timer = setInterval(goNext, SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slideshowOn, goNext]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) (delta < 0 ? goNext : goPrev)();
    touchStartX.current = null;
  }

  const current = images[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button type="button" onClick={close} className="absolute right-4 top-4 text-sm text-white/70 hover:text-white">
        Close
      </button>
      <button
        type="button"
        onClick={() => setSlideshowOn((v) => !v)}
        className="absolute left-4 top-4 text-sm text-white/70 hover:text-white"
      >
        {slideshowOn ? "Pause" : "Slideshow"}
      </button>

      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous"
        className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-6 text-2xl text-white/50 hover:text-white sm:left-6"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={goNext}
        aria-label="Next"
        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-6 text-2xl text-white/50 hover:text-white sm:right-6"
      >
        ›
      </button>

      <picture className="flex max-h-[80vh] max-w-full items-center justify-center">
        {pickSrc(current.urls, "2560").avif ? <source srcSet={pickSrc(current.urls, "2560").avif} type="image/avif" /> : null}
        <img
          src={pickSrc(current.urls, "2560").webp}
          alt={current.caption ?? current.filename}
          className="max-h-[80vh] max-w-full object-contain transition-opacity duration-200"
        />
      </picture>

      <p className="mt-4 text-xs tracking-wide text-white/60">{exifLine(current)}</p>

      {clientControls ? <ClientProofingPanel assetId={current.assetId} controls={clientControls} /> : null}
    </div>
  );
}
