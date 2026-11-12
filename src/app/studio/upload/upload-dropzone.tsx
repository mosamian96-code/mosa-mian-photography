"use client";

import { useEffect, useRef, useState } from "react";
import { organizeDroppedFiles } from "./organize-drop";
import { filesWithPathFromFileList, readDroppedFiles, type FileWithPath } from "./read-dropped-files";
import type { DuplicateMode } from "./upload-lib";
import { type FileToUpload, useUploader } from "./use-uploader";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatEta(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Drag-and-drop uploader, reused both by the standalone /studio/upload page (no
 * `resolveGalleryId` -> lands in the Library only, same as before) and inline on a
 * gallery/folder page (`resolveGalleryId` returns that page's target -> every photo
 * auto-attaches as soon as it's ready, no separate "add from library" step).
 *
 * The trigger stays inline (a small button or a large empty-state dropzone,
 * depending on `compact`), but once a batch starts, progress shows in a floating
 * dialog -- dismissing it doesn't stop the upload, it just hides the dialog; a
 * "view progress" link reopens it. */
export function UploadDropzone({
  resolveGalleryId,
  baseFolderId,
  onProgress,
  onStart,
  compact = false,
  contextTitle,
}: {
  resolveGalleryId?: () => Promise<string | null>;
  /** Enables drag-a-whole-folder-structure organizing: when set, dropping a folder
   * (not loose files) creates/reuses a gallery named after each dragged subfolder
   * directly under this folder id -- "Wedding/*.jpg" becomes a gallery "Wedding"
   * here; "2026/Wedding/*.jpg" becomes a folder "2026" here with a "Wedding" gallery
   * inside it. See organize-drop.ts. A drop with no folder structure (loose files
   * picked or dragged individually) falls back to resolveGalleryId as usual --
   * there's no folder name to derive a gallery from in that case. */
  baseFolderId?: string;
  /** Fires once per newly-finished entry (done or duplicate) -- lets the host page
   * refresh its own item list as photos land, without polling on its own. */
  onProgress?: () => void;
  /** Fires synchronously the moment a batch is handed off (drop or file picker),
   * before any upload work happens -- for a host page that conditionally
   * mounts/unmounts this component based on state onProgress's refresh can change
   * (e.g. "show the big empty-state dropzone only while the gallery has 0 items"),
   * so it can flip that state up front and stay mounted through the transition
   * instead of unmounting this mid-upload once the first item lands. */
  onStart?: () => void;
  compact?: boolean;
  /** Named in the dialog header ("Upload photos to '<contextTitle>'"). Omit for an
   * untargeted upload (the standalone Upload page). */
  contextTitle?: string;
}) {
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const { entries, running, runBatch, cancelBatch } = useUploader(resolveGalleryId, duplicateMode);
  const [isDragging, setIsDragging] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Only asked when there's actually something to lose -- `running` reflects the
  // client-side upload loop specifically (queued/hashing/uploading), not entries
  // still "processing" server-side after their bytes already finished transferring,
  // which cancelling here can't do anything about anyway.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const requestCloseDialog = () => {
    if (running) setConfirmCancelOpen(true);
    else setDialogOpen(false);
  };
  const [organizedInto, setOrganizedInto] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Defaults to false (desktop) for the server-rendered pass, then corrects itself
  // on mount -- touch capability isn't knowable during SSR, and guessing "desktop"
  // first is the safe direction, since the only consequence of a wrong guess is
  // one extra render before the real picker attributes apply, not a broken upload.
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads navigator, which doesn't exist during SSR.
    setIsTouchDevice(navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  }, []);
  const settledCountRef = useRef(0);
  // Rolling window of (timestamp, bytesDone) samples -- speed is measured across the
  // last few seconds rather than the whole upload's lifetime average, so the ETA
  // actually reflects current conditions (recovers quickly after a slow patch, e.g.
  // a mobile connection hiccup mid-batch) instead of staying skewed by a slow start
  // or a burst at the beginning.
  const progressHistoryRef = useRef<{ t: number; bytes: number }[]>([]);
  const [sampledStats, setSampledStats] = useState<{ etaLabel: string; bytesPerSec: number } | null>(null);
  // Locked once a batch actually starts -- runBatch already captured whatever
  // duplicateMode was current at that moment (useUploader's hook argument), so
  // changing the toggle mid-upload would silently do nothing for files already
  // queued while implying otherwise.
  const modeLocked = entries.length > 0;

  useEffect(() => {
    const settled = entries.filter((e) => e.status === "done" || e.status === "duplicate").length;
    if (settled > settledCountRef.current) {
      settledCountRef.current = settled;
      onProgress?.();
    }
  }, [entries, onProgress]);

  // If baseFolderId is set and the drop actually contains folder structure (a
  // relativePath with a "/" in it -- i.e. it came from a dragged/picked folder, not
  // individually-selected files), auto-create/reuse a gallery per dragged subfolder
  // and route each file there instead of everything going to one resolveGalleryId
  // target. Loose files with no folder of their own still fall back to
  // resolveGalleryId, same as when baseFolderId isn't set at all.
  async function resolveFilesToUpload(withPaths: FileWithPath[]): Promise<FileToUpload[]> {
    if (!baseFolderId || !withPaths.some((f) => f.relativePath.includes("/"))) {
      return withPaths.map((f) => ({ file: f.file }));
    }
    const { targeted, untargeted } = await organizeDroppedFiles(withPaths, baseFolderId);
    setOrganizedInto([...new Set(targeted.map((t) => t.galleryTitle))]);
    return [
      ...targeted.map((t) => ({ file: t.file, galleryId: t.galleryId })),
      ...untargeted.map((file) => ({ file })),
    ];
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    setDialogOpen(true);
    onStart?.();
    readDroppedFiles(e.dataTransfer)
      .then(resolveFilesToUpload)
      .then(runBatch);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setDialogOpen(true);
      onStart?.();
      resolveFilesToUpload(filesWithPathFromFileList(Array.from(e.target.files))).then(runBatch);
    }
    e.target.value = "";
  }

  const counts = {
    total: entries.length,
    done: entries.filter((e) => e.status === "duplicate" || e.status === "done").length,
    // Split out from "done" so re-dropping the same folder (e.g. after an earlier
    // session where the dialog looked like it had failed) doesn't read as "128
    // uploaded" when 96 of those were instantly-recognized repeats of the same 32
    // photos -- confirmed live, the gallery correctly ended up with exactly the 32
    // distinct photos despite the dialog's total climbing across several drops.
    duplicates: entries.filter((e) => e.status === "duplicate").length,
    errors: entries.filter((e) => e.status === "error" || e.status === "unsupported").length,
    cancelled: entries.filter((e) => e.status === "cancelled").length,
  };
  const inFlight = entries.filter((e) => e.status !== "done" && e.status !== "duplicate");
  const allSettled = entries.length > 0 && inFlight.length === 0;

  // Bytes actually transferred over the wire vs. total -- deliberately scoped to
  // the upload/transfer phase only, not "everything including server-side ingest,"
  // since that part's duration depends on a shared worker queue this page has no
  // visibility into and couldn't honestly estimate. "unsupported" entries never
  // transfer anything and are excluded from both sides so they don't skew the total.
  let bytesTotal = 0;
  let bytesDone = 0;
  for (const e of entries) {
    if (e.status === "unsupported") continue;
    bytesTotal += e.file.size;
    if (e.status === "uploading") bytesDone += e.file.size * e.progress;
    else if (e.status !== "queued" && e.status !== "hashing") bytesDone += e.file.size;
  }

  // Sampled on a steady 1-second clock rather than on every progress event, which
  // fire dozens of times a second across concurrent uploads -- recomputing (and
  // re-rendering) the ETA on each one was wasted work. The latest counters are read
  // through a ref so the interval doesn't restart on every tick.
  const transferring = bytesTotal > 0 && bytesDone < bytesTotal;
  const bytesRef = useRef({ done: bytesDone, total: bytesTotal });
  useEffect(() => {
    bytesRef.current = { done: bytesDone, total: bytesTotal };
  });

  useEffect(() => {
    if (!transferring) return;
    const history = progressHistoryRef.current;
    const sample = () => {
      const now = Date.now();
      const { done, total } = bytesRef.current;
      history.push({ t: now, bytes: done });
      while (history.length > 1 && now - history[0].t > 8000) history.shift();
      const oldest = history[0];
      const elapsedSec = (now - oldest.t) / 1000;
      const bytesInWindow = done - oldest.bytes;
      if (elapsedSec < 1 || bytesInWindow <= 0) {
        // The first sample of a new batch replaces the previous batch's final ETA;
        // later empty windows (a brief stall) keep showing the last real estimate.
        const calculating = { etaLabel: "calculating…", bytesPerSec: 0 };
        const isFirstSample = history.length === 1;
        setSampledStats((prev) => (isFirstSample ? calculating : (prev ?? calculating)));
        return;
      }
      const bytesPerSec = bytesInWindow / elapsedSec;
      setSampledStats({ etaLabel: formatEta((total - done) / bytesPerSec), bytesPerSec });
    };
    const firstSample = setTimeout(sample, 0);
    const interval = setInterval(sample, 1000);
    return () => {
      clearTimeout(firstSample);
      clearInterval(interval);
      history.length = 0;
    };
  }, [transferring]);

  const transferStats = transferring ? sampledStats : null;

  return (
    <div>
      <div className={`flex items-center gap-2 ${compact ? "mb-1.5" : "mb-2"}`}>
        <span className={`text-neutral-500 dark:text-neutral-400 ${compact ? "text-[11px]" : "text-xs"}`}>
          If a photo is already in the library:
        </span>
        <div
          role="group"
          aria-label="Duplicate handling"
          className="inline-flex rounded border border-neutral-300 dark:border-neutral-700"
        >
          {(
            [
              { key: "skip", label: "Skip it" },
              { key: "keep", label: "Add as new copy" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={modeLocked}
              aria-pressed={duplicateMode === opt.key}
              onClick={() => setDuplicateMode(opt.key)}
              className={`px-2 py-1 text-xs transition-colors first:rounded-l last:rounded-l-none last:border-l disabled:cursor-not-allowed disabled:opacity-50 ${
                duplicateMode === opt.key
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900"
              } border-neutral-300 dark:border-neutral-700`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded border-2 border-dashed text-center transition-colors ${
          compact ? "gap-1 px-4 py-6" : "px-6 py-16"
        } ${
          isDragging
            ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <p className={`text-neutral-600 dark:text-neutral-400 ${compact ? "text-xs" : "text-sm"}`}>
          {isTouchDevice
            ? "Choose photos or videos from your phone"
            : baseFolderId
              ? compact
                ? "Drop photos or folders here"
                : "Drop a folder here — each subfolder becomes its own gallery"
              : compact
                ? "Drop photos here"
                : "Drop a folder here"}
        </p>
        {!compact && !isTouchDevice ? <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">or</p> : null}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`rounded bg-neutral-900 font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${
            compact ? "mt-2 px-2.5 py-1 text-xs" : "mt-2 px-3 py-1.5 text-sm"
          }`}
        >
          {isTouchDevice ? "Choose photos or videos" : "Choose files"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          // webkitdirectory forces a folder/file-system browser, not the native
          // Photos/Gallery picker -- exactly backwards from what a phone visitor
          // wants (confirmed live: "it goes to all my files... instead it should go
          // directly to my media gallery"). Folder uploads are a desktop/drag-drop
          // feature to begin with (there's no dragging a folder on a touchscreen),
          // so this only applies when there's no touch capability to hand it to a
          // media-only picker instead. accept scopes that picker to photos/videos.
          // @ts-expect-error -- webkitdirectory has no TS typing but is broadly supported
          webkitdirectory={compact || isTouchDevice ? undefined : ""}
          accept={isTouchDevice ? "image/*,video/*" : undefined}
          multiple
          className="hidden"
          onChange={handlePick}
        />
      </div>

      {!dialogOpen && entries.length > 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {counts.done} / {counts.total} uploaded
          {counts.duplicates > 0 ? ` (${counts.duplicates} already in library)` : ""}
          {counts.errors > 0 ? `, ${counts.errors} need attention` : ""}
          {counts.cancelled > 0 ? `, ${counts.cancelled} cancelled` : ""}
          {transferStats ? ` — ${transferStats.etaLabel} left` : ""} — view progress
        </button>
      ) : null}

      {dialogOpen && entries.length > 0 ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24"
          onClick={requestCloseDialog}
        >
          <div
            className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-neutral-950 text-neutral-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-medium">
                  Upload photos{contextTitle ? <> to &ldquo;{contextTitle}&rdquo;</> : null}
                </h2>
                {organizedInto && organizedInto.length > 0 ? (
                  <p className="truncate text-xs text-white/50">
                    Organized into: {organizedInto.join(", ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={requestCloseDialog}
                aria-label="Close"
                className="shrink-0 text-white/50 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden px-5 py-4">
              <div className="flex-1 overflow-y-auto">
                <p className="text-xs font-medium tracking-wide text-white/40 uppercase">
                  {allSettled ? "Done" : "Uploading"}
                </p>
                <ul className="mt-2 space-y-3">
                  {(allSettled ? entries : inFlight).map((entry) => {
                    const failed = entry.status === "error" || entry.status === "unsupported";
                    const settled = entry.status === "done" || entry.status === "duplicate";
                    const pct = settled ? 1 : failed ? 1 : entry.progress;
                    return (
                      <li key={entry.id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate text-white/90">{entry.file.name}</span>
                          <span className={`ml-3 shrink-0 text-xs ${failed ? "text-red-400" : "text-white/40"}`}>
                            {entry.status === "uploading" ? `${Math.round(entry.progress * 100)}%` : failed ? entry.error : entry.status}
                          </span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all ${failed ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="w-28 shrink-0 border-l border-white/10 pl-4 text-center">
                <p className="text-xs font-medium tracking-wide text-white/40 uppercase">Completed</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {counts.done}
                  <span className="text-base text-white/40"> / {counts.total}</span>
                </p>
                {counts.duplicates > 0 ? (
                  <p className="mt-1 text-xs text-white/40">{counts.duplicates} already in library</p>
                ) : null}
                {counts.errors > 0 ? <p className="mt-1 text-xs text-red-400">{counts.errors} failed</p> : null}
                {counts.cancelled > 0 ? <p className="mt-1 text-xs text-white/40">{counts.cancelled} cancelled</p> : null}
                {transferStats ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-xs font-medium tracking-wide text-white/40 uppercase">Time left</p>
                    <p className="mt-1 text-sm font-medium text-white/90">{transferStats.etaLabel}</p>
                    {transferStats.bytesPerSec > 0 ? (
                      <p className="mt-0.5 text-xs text-white/40">{formatBytes(transferStats.bytesPerSec)}/s</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex items-center justify-center gap-2 border-t border-white/10 px-5 py-4 text-sm transition-colors ${
                isDragging ? "bg-white/10" : ""
              }`}
            >
              <UploadCloudIcon />
              <span className="text-white/60">{isTouchDevice ? "Add more from" : "Drag photos here or"}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="font-medium text-emerald-400 hover:text-emerald-300"
              >
                {isTouchDevice ? "your photos" : "browse your computer"}
              </button>
            </div>
            <div className="h-1 bg-white/10">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round((counts.done / (counts.total || 1)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {confirmCancelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-5 text-neutral-100 shadow-2xl">
            <h3 className="text-sm font-medium">Cancel upload?</h3>
            <p className="mt-2 text-xs text-white/60">
              {inFlight.length} file{inFlight.length === 1 ? "" : "s"} still uploading will stop. Anything already
              finished stays.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                className="rounded px-3 py-1.5 text-xs text-white/70 hover:text-white"
              >
                Keep uploading
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelBatch();
                  setConfirmCancelOpen(false);
                  setDialogOpen(false);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Cancel upload
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function UploadCloudIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-white/40">
      <path d="M7 18a4 4 0 0 1-1-7.87A5 5 0 0 1 16 8a4.5 4.5 0 0 1 1 8.9" />
      <path d="M12 12v7M9 15l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
