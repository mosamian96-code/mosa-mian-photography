"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImage } from "@/lib/public-site/resolve";
import type { CommentItem, PublicDownload } from "./gallery-view";

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

// Matches --dur-base in globals.css -- the close animation plays out fully before the
// component actually unmounts, so leaving never feels like an abrupt cut.
const CLOSE_MS = 260;

function IconButton({
  onClick,
  label,
  active,
  children,
  className,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${active ? "bg-white/15 text-white" : ""} ${className ?? ""}`}
    >
      {children}
    </button>
  );
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
            className="flex items-center gap-1 text-white/70 transition-colors hover:text-white"
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
            className="text-white/70 transition-colors hover:text-white"
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
              className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition-colors hover:text-white disabled:opacity-40"
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
  showCameraInfo = true,
  showFilenames = false,
  slideshowEnabled = true,
  publicDownload,
  clientControls,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  showCameraInfo?: boolean;
  showFilenames?: boolean;
  slideshowEnabled?: boolean;
  publicDownload?: PublicDownload;
  clientControls?: LightboxClientControls;
}) {
  const [slideshowOn, setSlideshowOn] = useState(false);
  const [closing, setClosing] = useState(false);
  // Tagged with the asset it belongs to, so stepping from one video to the next can't
  // briefly play the previous video's URL while the new one is still being fetched.
  const [video, setVideo] = useState<{ assetId: string; url: string } | null>(null);
  const touchStartX = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const goNext = useCallback(() => onNavigate((index + 1) % images.length), [index, images.length, onNavigate]);
  const goPrev = useCallback(
    () => onNavigate((index - 1 + images.length) % images.length),
    [index, images.length, onNavigate],
  );
  // The close animation is interruptible by design -- it's a plain timeout, not a
  // blocking transition, so a second close request (double Escape, etc.) just no-ops
  // rather than queuing or restarting anything.
  const requestClose = useCallback(() => {
    setClosing(true);
    setSlideshowOn(false);
    setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  // Focus trap: a modal dialog must not let Tab escape into the page behind it (WCAG
  // 2.2 AA keyboard-interaction requirement). Moves focus in on mount and restores it
  // to whatever had focus before opening, on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    function focusableElements() {
      return Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") requestClose();
      else if (e.key === "Tab") {
        const elements = focusableElements();
        if (elements.length === 0) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, requestClose]);

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
  const videoUrl = video?.assetId === current.assetId ? video.url : null;

  useEffect(() => {
    if (current.kind !== "video") return;
    const assetId = current.assetId;
    let cancelled = false;
    fetch(`/api/public/video-url?galleryId=${publicDownload?.galleryId}&assetId=${assetId}`)
      .then((r) => r.json())
      .then((data: { url?: string }) => {
        if (!cancelled && data.url) setVideo({ assetId, url: data.url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current.assetId, current.kind, publicDownload?.galleryId]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo viewer, image ${index + 1} of ${images.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 outline-none"
      style={{
        animation: `${closing ? "lightbox-backdrop-out" : "lightbox-backdrop-in"} ${CLOSE_MS}ms var(--ease-swap) forwards`,
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {slideshowEnabled ? (
          <IconButton onClick={() => setSlideshowOn((v) => !v)} label={slideshowOn ? "Pause slideshow" : "Start slideshow"} active={slideshowOn}>
            {slideshowOn ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5v14l12-7Z" />
              </svg>
            )}
          </IconButton>
        ) : null}
        <IconButton onClick={requestClose} label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </IconButton>
      </div>

      <div className="absolute left-2 top-1/2 z-10 -translate-y-1/2 sm:left-4">
        <IconButton onClick={goPrev} label="Previous photo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </IconButton>
      </div>
      <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2 sm:right-4">
        <IconButton onClick={goNext} label="Next photo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </IconButton>
      </div>

      <div
        key={current.assetId}
        className="flex max-h-[80vh] max-w-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: `lightbox-image-in var(--dur-slow) var(--ease-settle) both` }}
      >
        {current.kind === "video" ? (
          <video
            src={videoUrl || undefined}
            poster={pickSrc(current.urls, "2560").webp}
            controls
            playsInline
            className="max-h-[80vh] max-w-full object-contain"
            style={{ backgroundColor: "#000" }}
          />
        ) : pickSrc(current.urls, "2560").webp ? (
          <picture className="flex max-h-[80vh] max-w-full items-center justify-center">
            {pickSrc(current.urls, "2560").avif ? <source srcSet={pickSrc(current.urls, "2560").avif} type="image/avif" /> : null}
            <img
              src={pickSrc(current.urls, "2560").webp}
              alt={current.caption ?? current.filename}
              className="max-h-[80vh] max-w-full object-contain"
            />
          </picture>
        ) : (
          <div
            className="flex h-[50vh] w-[min(80vw,40rem)] items-center justify-center bg-neutral-800 bg-cover bg-center"
            style={current.lqip ? { backgroundImage: `url(${current.lqip})` } : undefined}
          >
            <p className="rounded bg-black/50 px-3 py-1.5 text-sm text-white/80">This photo is still being prepared.</p>
          </div>
        )}

        <div
          className="mt-4 flex flex-col items-center gap-1"
          style={{ animation: `reveal-up var(--dur-base) var(--ease-settle) 120ms both` }}
        >
          {current.caption ? <p className="max-w-md text-center text-sm text-white/85">{current.caption}</p> : null}
          {showFilenames ? <p className="text-xs text-white/40">{current.filename}</p> : null}
          {showCameraInfo && exifLine(current) ? <p className="text-xs tracking-wide text-white/50">{exifLine(current)}</p> : null}
          <p className="text-[11px] tabular-nums text-white/30">
            {index + 1} / {images.length}
          </p>
          {publicDownload ? (
            <a
              href={`/api/public/gallery-download?galleryId=${publicDownload.galleryId}&assetId=${current.assetId}`}
              className="mt-1 text-xs text-white/60 underline transition-colors hover:text-white"
            >
              Download
            </a>
          ) : null}
        </div>

        {clientControls ? <ClientProofingPanel assetId={current.assetId} controls={clientControls} /> : null}
      </div>
    </div>
  );
}
