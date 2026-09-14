"use client";

import { useEffect, useRef, useState } from "react";
import { readDroppedFiles } from "./read-dropped-files";
import { useUploader } from "./use-uploader";

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
  onProgress,
  compact = false,
  contextTitle,
}: {
  resolveGalleryId?: () => Promise<string | null>;
  /** Fires once per newly-finished entry (done or duplicate) -- lets the host page
   * refresh its own item list as photos land, without polling on its own. */
  onProgress?: () => void;
  compact?: boolean;
  /** Named in the dialog header ("Upload photos to '<contextTitle>'"). Omit for an
   * untargeted upload (the standalone Upload page). */
  contextTitle?: string;
}) {
  const { entries, runBatch } = useUploader(resolveGalleryId);
  const [isDragging, setIsDragging] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settledCountRef = useRef(0);

  useEffect(() => {
    const settled = entries.filter((e) => e.status === "done" || e.status === "duplicate").length;
    if (settled > settledCountRef.current) {
      settledCountRef.current = settled;
      onProgress?.();
    }
  }, [entries, onProgress]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    setDialogOpen(true);
    readDroppedFiles(e.dataTransfer).then(runBatch);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setDialogOpen(true);
      runBatch(Array.from(e.target.files));
    }
    e.target.value = "";
  }

  const counts = {
    total: entries.length,
    done: entries.filter((e) => e.status === "duplicate" || e.status === "done").length,
    errors: entries.filter((e) => e.status === "error" || e.status === "unsupported").length,
  };
  const inFlight = entries.filter((e) => e.status !== "done" && e.status !== "duplicate");
  const allSettled = entries.length > 0 && inFlight.length === 0;

  return (
    <div>
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
          {compact ? "Drop photos here" : "Drop a folder here"}
        </p>
        {!compact ? <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">or</p> : null}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`rounded bg-neutral-900 font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${
            compact ? "mt-2 px-2.5 py-1 text-xs" : "mt-2 px-3 py-1.5 text-sm"
          }`}
        >
          Choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          // @ts-expect-error -- webkitdirectory has no TS typing but is broadly supported
          webkitdirectory={compact ? undefined : ""}
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
          {counts.done} / {counts.total} uploaded{counts.errors > 0 ? `, ${counts.errors} need attention` : ""} — view
          progress
        </button>
      ) : null}

      {dialogOpen && entries.length > 0 ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-neutral-950 text-neutral-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="truncate text-base font-medium">
                Upload photos{contextTitle ? <> to &ldquo;{contextTitle}&rdquo;</> : null}
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
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
                {counts.errors > 0 ? <p className="mt-1 text-xs text-red-400">{counts.errors} failed</p> : null}
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
              <span className="text-white/60">Drag photos here or</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="font-medium text-emerald-400 hover:text-emerald-300"
              >
                browse your computer
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
