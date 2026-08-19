"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { classifyKind } from "@/lib/ingest/classify";
import { readDroppedFiles } from "./read-dropped-files";
import { checkDuplicate, createBatch, hashFile, uploadFile } from "./upload-lib";

type EntryStatus =
  | "queued"
  | "hashing"
  | "duplicate"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "unsupported";

type Entry = {
  id: string;
  file: File;
  status: EntryStatus;
  progress: number;
  assetId?: string;
  error?: string;
};

const CONCURRENCY = 3;
const POLL_INTERVAL_MS = 2000;

export default function UploadPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patchEntry = useCallback((id: string, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // Ingest happens in the background worker, after uploadFile() already resolved --
  // poll actual asset status so "processing" doesn't just sit there forever once the
  // upload itself is done.
  useEffect(() => {
    const pending = entries.filter((e) => e.status === "processing" && e.assetId);
    if (pending.length === 0) return;

    const timer = setTimeout(async () => {
      const ids = pending.map((e) => e.assetId!).join(",");
      const res = await fetch(`/api/upload/status?ids=${ids}`);
      const { items } = (await res.json()) as {
        items: { id: string; status: string; errorMessage: string | null }[];
      };
      for (const item of items) {
        const entry = pending.find((e) => e.assetId === item.id);
        if (!entry) continue;
        if (item.status === "ready") patchEntry(entry.id, { status: "done" });
        else if (item.status === "failed") {
          patchEntry(entry.id, { status: "error", error: item.errorMessage ?? "ingest failed" });
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [entries, patchEntry]);

  async function processOne(entry: Entry, batchId: string) {
    try {
      patchEntry(entry.id, { status: "hashing" });
      const sha256 = await hashFile(entry.file);

      const check = await checkDuplicate(sha256, batchId);
      if (check.exists) {
        patchEntry(entry.id, { status: "duplicate", progress: 1 });
        return;
      }

      patchEntry(entry.id, { status: "uploading", progress: 0 });
      const outcome = await uploadFile(entry.file, sha256, batchId, (fraction) =>
        patchEntry(entry.id, { progress: fraction }),
      );
      patchEntry(entry.id, { status: "processing", progress: 1, assetId: outcome.assetId });
    } catch (err) {
      patchEntry(entry.id, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runBatch(files: File[]) {
    const supported = files.filter((f) => classifyKind(f.name) !== null);
    const unsupported = files.filter((f) => classifyKind(f.name) === null);

    const newEntries: Entry[] = [
      ...supported.map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const, progress: 0 })),
      ...unsupported.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "unsupported" as const,
        progress: 0,
        error: "not a recognized photo/sidecar type",
      })),
    ];
    setEntries(newEntries);

    if (supported.length === 0) return;

    setRunning(true);
    const { batchId } = await createBatch(supported.length);

    const queue = newEntries.filter((e) => e.status === "queued");
    let next = 0;
    async function worker() {
      for (;;) {
        const i = next++;
        if (i >= queue.length) return;
        await processOne(queue[i], batchId);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    readDroppedFiles(e.dataTransfer).then(runBatch);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) runBatch(Array.from(e.target.files));
    e.target.value = "";
  }

  const counts = {
    total: entries.length,
    done: entries.filter((e) => e.status === "duplicate" || e.status === "done").length,
    errors: entries.filter((e) => e.status === "error" || e.status === "unsupported").length,
    processing: entries.filter((e) => e.status === "processing").length,
  };

  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900">Upload</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Drag a folder in, or pick one. RAW, JPEG, HEIC, and .xmp sidecars are recognized; anything
        else is skipped. Re-dropping a folder you already imported costs nothing — matching files
        are detected by content and never re-uploaded.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mt-6 flex flex-col items-center justify-center rounded border-2 border-dashed px-6 py-16 text-center transition-colors ${
          isDragging ? "border-neutral-900 bg-neutral-100" : "border-neutral-300"
        }`}
      >
        <p className="text-sm text-neutral-600">Drop a folder here</p>
        <p className="mt-1 text-xs text-neutral-400">or</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Choose a folder
        </button>
        <input
          ref={fileInputRef}
          type="file"
          // @ts-expect-error -- webkitdirectory has no TS typing but is broadly supported
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handlePick}
        />
      </div>

      {entries.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm text-neutral-600">
            {counts.done + counts.errors} / {counts.total} handled
            {running || counts.processing > 0 ? " — still working..." : ""}
            {counts.errors > 0 ? `, ${counts.errors} need attention` : ""}
          </p>
          <ul className="mt-3 max-h-96 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate text-neutral-800">{entry.file.name}</span>
                <span
                  className={`ml-3 shrink-0 text-xs ${
                    entry.status === "error" || entry.status === "unsupported"
                      ? "text-red-600"
                      : entry.status === "duplicate" || entry.status === "done"
                        ? "text-neutral-400"
                        : "text-neutral-500"
                  }`}
                >
                  {entry.status === "uploading"
                    ? `uploading ${Math.round(entry.progress * 100)}%`
                    : entry.status === "error" || entry.status === "unsupported"
                      ? entry.error
                      : entry.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">
            See the full result in the{" "}
            <Link href="/studio/library" className="underline">
              library
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
