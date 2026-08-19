"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { JustifiedGrid } from "./justified-grid";
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

export function GalleryView({ images }: { images: GalleryImage[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iParam = searchParams.get("i");
  const openIndex = iParam !== null ? Number(iParam) : null;
  const isOpen = openIndex !== null && openIndex >= 0 && openIndex < images.length;

  const [slideshowOn, setSlideshowOn] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const setIndex = useCallback(
    (index: number | null) => {
      const params = new URLSearchParams(searchParams);
      if (index === null) params.delete("i");
      else params.set("i", String(index));
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const goNext = useCallback(() => {
    if (openIndex === null) return;
    setIndex((openIndex + 1) % images.length);
  }, [openIndex, images.length, setIndex]);

  const goPrev = useCallback(() => {
    if (openIndex === null) return;
    setIndex((openIndex - 1 + images.length) % images.length);
  }, [openIndex, images.length, setIndex]);

  const close = useCallback(() => {
    setIndex(null);
    setSlideshowOn(false);
  }, [setIndex]);

  // Keyboard nav + Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, goNext, goPrev, close]);

  // Neighbor preloading.
  useEffect(() => {
    if (openIndex === null) return;
    for (const offset of [1, -1]) {
      const neighbor = images[(openIndex + offset + images.length) % images.length];
      const src = pickSrc(neighbor.urls, "2560").webp;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    }
  }, [openIndex, images]);

  // Slideshow auto-advance.
  useEffect(() => {
    if (!isOpen || !slideshowOn) return;
    const timer = setInterval(goNext, SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, slideshowOn, goNext]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) (delta < 0 ? goNext : goPrev)();
    touchStartX.current = null;
  }

  const current = openIndex !== null ? images[openIndex] : null;

  return (
    <>
      <JustifiedGrid
        items={images.map((img) => ({ id: img.assetId, aspect: (img.width ?? 3) / (img.height ?? 2) }))}
        targetRowHeight={260}
        gap={4}
        renderItem={(item, width, height) => {
          const index = images.findIndex((img) => img.assetId === item.id);
          const image = images[index];
          const src = pickSrc(image.urls, "400");
          return (
            <button
              type="button"
              onClick={() => setIndex(index)}
              className="block h-full w-full overflow-hidden bg-neutral-100 transition-opacity hover:opacity-90"
              style={{ width, height, backgroundImage: image.lqip ? `url(${image.lqip})` : undefined, backgroundSize: "cover" }}
            >
              <picture>
                {src.avif ? <source srcSet={src.avif} type="image/avif" /> : null}
                {src.webp ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src.webp} alt={image.caption ?? image.filename} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </picture>
            </button>
          );
        }}
      />

      {isOpen && current ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 text-sm text-white/70 hover:text-white"
          >
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
            {pickSrc(current.urls, "2560").avif ? (
              <source srcSet={pickSrc(current.urls, "2560").avif} type="image/avif" />
            ) : null}
            <img
              src={pickSrc(current.urls, "2560").webp}
              alt={current.caption ?? current.filename}
              className="max-h-[80vh] max-w-full object-contain transition-opacity duration-200"
            />
          </picture>

          <p className="mt-4 text-xs tracking-wide text-white/60">{exifLine(current)}</p>
        </div>
      ) : null}
    </>
  );
}
