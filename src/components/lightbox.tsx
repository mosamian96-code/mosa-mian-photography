"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImage } from "@/lib/public-site/resolve";

function pickSrc(urls: Record<string, string>, variant: string) {
  return { avif: urls[`avif${variant}`], webp: urls[`webp${variant}`] };
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
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
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
    </div>
  );
}
