"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { assetId: string; filename: string; thumbUrl: string | null };

type Detail = {
  asset: {
    filename: string;
    kind: string;
    width: number | null;
    height: number | null;
    byteSize: number;
    capturedAt: string | null;
    previewUrl: string | null;
  };
  metadata: {
    camera: string | null;
    lens: string | null;
    iso: number | null;
    shutter: string | null;
    aperture: string | null;
    focalLength: string | null;
    gpsLat: number | null;
    gpsLon: number | null;
  } | null;
  galleries: { galleryId: string; title: string }[];
};

function formatBytes(n: number) {
  if (n < 1e6) return `${(n / 1e3).toFixed(0)} KB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}

function exifLine(m: Detail["metadata"]) {
  if (!m) return "";
  return [m.camera, m.lens, m.aperture, m.shutter, m.iso ? `ISO ${m.iso}` : null].filter(Boolean).join("  ·  ");
}

/** The studio's own big-view photo viewer -- same visual language as the public
 * lightbox (dark, full-viewport, crossfade), but with admin-only actions (download,
 * delete, an EXIF info panel) that must never reach the public site, so this is a
 * separate component rather than reusing src/components/lightbox.tsx directly. */
export function StudioLightbox({
  items,
  index,
  onClose,
  onIndexChange,
  onDeleted,
}: {
  items: Item[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const current = items[index];

  const goNext = useCallback(() => onIndexChange((index + 1) % items.length), [index, items.length, onIndexChange]);
  const goPrev = useCallback(() => onIndexChange((index - 1 + items.length) % items.length), [index, items.length, onIndexChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-index-change; setState happens in the async continuation below.
    setDetail(null);
    if (!current) return;
    fetch(`/api/library/${current.assetId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
      else if (e.key === "i") setShowInfo((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onClose]);

  function download() {
    if (!current) return;
    if (!window.confirm("Download the original file for this photo?")) return;
    window.location.href = `/api/library/${current.assetId}/download`;
  }

  async function deletePhoto() {
    if (!current) return;
    if (!window.confirm("Permanently delete this photo? It will be removed from every gallery it appears in.")) return;
    setDeleting(true);
    await fetch(`/api/library/${current.assetId}`, { method: "DELETE" });
    setDeleting(false);
    onDeleted();
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/70">
        <span>
          {index + 1} / {items.length}
        </span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className={`rounded px-3 py-1.5 hover:bg-white/10 ${showInfo ? "bg-white/10 text-white" : ""}`}
          >
            Info
          </button>
          <button type="button" onClick={download} className="rounded px-3 py-1.5 hover:bg-white/10">
            Download
          </button>
          <button
            type="button"
            onClick={deletePhoto}
            disabled={deleting}
            className="rounded px-3 py-1.5 text-red-400 hover:bg-white/10 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-lg hover:bg-white/10">
            ✕
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous"
          className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/50 hover:text-white sm:left-6"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/50 hover:text-white sm:right-6"
        >
          ›
        </button>

        {detail?.asset.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.assetId}
            src={detail.asset.previewUrl}
            alt={detail.asset.filename}
            className="max-h-full max-w-full object-contain"
            style={{ animation: "lightbox-image-in var(--dur-slow, 400ms) var(--ease-settle, ease-out) both" }}
          />
        ) : current.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.thumbUrl} alt={current.filename} className="max-h-full max-w-full object-contain opacity-60" />
        ) : (
          <div className="text-sm text-white/40">Loading…</div>
        )}

        {showInfo && detail ? (
          <div className="absolute bottom-4 right-4 w-72 rounded bg-black/80 p-4 text-xs text-white/80 backdrop-blur">
            <p className="break-all text-white">{detail.asset.filename}</p>
            <dl className="mt-2 space-y-1">
              {detail.asset.width && detail.asset.height ? (
                <div className="flex justify-between">
                  <dt>Dimensions</dt>
                  <dd>
                    {detail.asset.width} × {detail.asset.height}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Size</dt>
                <dd>{formatBytes(detail.asset.byteSize)}</dd>
              </div>
              {detail.asset.capturedAt ? (
                <div className="flex justify-between">
                  <dt>Captured</dt>
                  <dd>{new Date(detail.asset.capturedAt).toLocaleDateString()}</dd>
                </div>
              ) : null}
              {exifLine(detail.metadata) ? <p className="mt-2 text-white/60">{exifLine(detail.metadata)}</p> : null}
              {detail.metadata?.focalLength ? <p className="text-white/60">{detail.metadata.focalLength}</p> : null}
              {detail.metadata?.gpsLat && detail.metadata?.gpsLon ? (
                <p className="text-white/60">
                  {detail.metadata.gpsLat.toFixed(4)}, {detail.metadata.gpsLon.toFixed(4)}
                </p>
              ) : null}
              {detail.galleries.length > 0 ? (
                <div className="mt-2">
                  <p className="text-white/50">In galleries:</p>
                  {detail.galleries.map((g) => (
                    <p key={g.galleryId}>{g.title}</p>
                  ))}
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
