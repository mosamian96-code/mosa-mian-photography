"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classifyKind } from "@/lib/ingest/classify";
import {
  addToGallery,
  checkDuplicate,
  completeDuplicate,
  createBatch,
  type DuplicateMode,
  hashFile,
  isAttachEligible,
  uploadFile,
} from "./upload-lib";

export type EntryStatus =
  | "queued"
  | "hashing"
  | "duplicate"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "unsupported";

export type Entry = {
  id: string;
  file: File;
  status: EntryStatus;
  progress: number;
  assetId?: string;
  error?: string;
};

const CONCURRENCY = 3;
const POLL_INTERVAL_MS = 2000;

/** Shared upload engine behind /studio/upload and the inline gallery/folder
 * dropzones -- hashing, dedup, B2 upload, and ingest-status polling are identical
 * everywhere; only what happens to a finished asset differs.
 *
 * @param resolveGalleryId Called once per batch, before any file is processed. A
 * returned gallery id auto-attaches every uploaded/duplicate asset to it as soon as
 * it's known to be attach-eligible (see isAttachEligible); returning/omitting null
 * leaves assets in the Library only.
 * @param duplicateMode "skip" (default) leaves an existing match alone, same as
 * always. "keep" creates a second, independent library entry for it instead --
 * bytes are never re-uploaded either way (sha256 already identifies them), this only
 * changes whether a new asset row (and gallery attachment) is created for the match. */
export function useUploader(resolveGalleryId?: () => Promise<string | null>, duplicateMode: DuplicateMode = "skip") {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const galleryIdRef = useRef<string | null>(null);

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
        items: { id: string; status: string; errorMessage: string | null; groupId: string | null; isGroupPrimary: boolean }[];
      };
      for (const item of items) {
        const entry = pending.find((e) => e.assetId === item.id);
        if (!entry) continue;
        if (item.status === "ready") {
          const galleryId = galleryIdRef.current;
          if (galleryId && isAttachEligible(item.groupId, item.isGroupPrimary)) {
            await addToGallery(galleryId, item.id).catch(() => {});
          }
          patchEntry(entry.id, { status: "done" });
        } else if (item.status === "failed") {
          patchEntry(entry.id, { status: "error", error: item.errorMessage ?? "ingest failed" });
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [entries, patchEntry]);

  const processOne = useCallback(
    async (entry: Entry, batchId: string) => {
      try {
        patchEntry(entry.id, { status: "hashing" });
        const sha256 = await hashFile(entry.file);

        const check = await checkDuplicate(sha256, batchId, duplicateMode);
        if (check.exists && !check.keep) {
          const galleryId = galleryIdRef.current;
          if (galleryId && check.assetId && isAttachEligible(check.groupId, check.isGroupPrimary)) {
            await addToGallery(galleryId, check.assetId).catch(() => {});
          }
          patchEntry(entry.id, { status: "duplicate", progress: 1, assetId: check.assetId });
          return;
        }

        if (check.exists && check.keep) {
          // "Keep duplicates": bytes are already in storage under check.storageKey
          // (content-addressed -- this is genuinely the same file), so there's
          // nothing to upload, only a new, independent asset row to create. That row
          // starts at "pending" like any fresh upload and goes through the same
          // ingest pipeline (its own group/gallery-attach happens via the polling
          // effect above once it reaches "ready") -- check.groupId/isGroupPrimary
          // describe the *original* asset, not this new one, so they don't apply here.
          patchEntry(entry.id, { status: "processing", progress: 1 });
          const outcome = await completeDuplicate(check.storageKey!, sha256, entry.file, batchId);
          patchEntry(entry.id, { status: "processing", progress: 1, assetId: outcome.assetId });
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
    },
    [patchEntry],
  );

  const runBatch = useCallback(
    async (files: File[]) => {
      const supported = files.filter((f) => classifyKind(f.name) !== null);
      const unsupported = files.filter((f) => classifyKind(f.name) === null);

      const newEntries: Entry[] = [
        ...supported.map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const, progress: 0 })),
        ...unsupported.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "unsupported" as const,
          progress: 0,
          error: "not a recognized photo, video, or sidecar type",
        })),
      ];
      // Appended, not replaced: the dialog's own dropzone invites dropping more
      // files while a batch is still running, but this used to call
      // setEntries(newEntries) -- wiping out every in-progress entry from the
      // batch already running. Those files kept uploading successfully in the
      // background (their own already-launched promises don't care what `entries`
      // holds), but the dialog looked like the whole upload had vanished, which is
      // exactly the "dialog disappeared, so I uploaded again" report this fixes --
      // confirmed live via a gallery that had the same folder uploaded 4 times.
      setEntries((prev) => [...prev, ...newEntries]);

      if (supported.length === 0) return;

      setRunning(true);
      try {
        galleryIdRef.current = resolveGalleryId ? await resolveGalleryId() : null;
      } catch (err) {
        setEntries((prev) =>
          prev.map((e) =>
            e.status === "queued"
              ? { ...e, status: "error", error: err instanceof Error ? err.message : "failed to resolve destination" }
              : e,
          ),
        );
        setRunning(false);
        return;
      }

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
    },
    [processOne, resolveGalleryId],
  );

  return { entries, running, runBatch };
}
