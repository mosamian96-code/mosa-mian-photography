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
import { listPendingUploads } from "./pending-uploads-db";
import { acquireWakeLock, reacquireWakeLockOnVisible, releaseWakeLock } from "./wake-lock";

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
  /** Per-file destination, set when this entry came from an auto-organized folder
   * drop (organize-drop.ts) -- takes priority over resolveGalleryId's single shared
   * target. undefined (not set) falls back to resolveGalleryId/galleryIdRef; an
   * explicit null means "Library only, don't fall back" (an organized drop's loose
   * files with no folder of their own to imply a gallery). */
  targetGalleryId?: string | null;
};

/** What runBatch actually takes: a file plus where it goes. galleryId omitted means
 * "use whatever resolveGalleryId resolves for this whole batch" (every existing
 * caller); set it explicitly to route an individual file elsewhere, which is how an
 * organized folder drop sends different files to different galleries in one batch. */
export type FileToUpload = { file: File; galleryId?: string | null };

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

  // Keeps the screen from auto-locking while a batch is running -- a real, if
  // partial, answer to "the upload should continue even if I close the browser":
  // the screen turning itself off is a more common interruption than a deliberate
  // app-switch, and this is the one part of that request a web page can actually
  // prevent (the deliberate-switch case is a platform restriction no page's code
  // can override; pending-uploads-db.ts's resumability is the answer to *that*).
  useEffect(() => {
    if (!running) return;
    acquireWakeLock();
    const stopWatching = reacquireWakeLockOnVisible(() => running);
    return () => {
      stopWatching();
      releaseWakeLock();
    };
  }, [running]);

  // Ingest happens in the background worker, after uploadFile() already resolved --
  // poll actual asset status so "processing" doesn't just sit there forever once the
  // upload itself is done.
  //
  // Self-rescheduling on a plain interval, not "setTimeout, depend on entries so it
  // reschedules when something changes" (the previous version): that only rescheduled
  // when a poll actually found something to update via patchEntry. The very next poll
  // after uploads finish is the most likely one to come back with every asset still
  // "processing" server-side (this worker only processes 2 at a time -- a normal
  // batch outlives its own upload phase by minutes), which calls patchEntry for
  // nothing, so `entries` never changes, so the effect never re-runs, so polling
  // silently stops forever -- confirmed live: a 32-photo batch stuck at "processing"
  // with 0/32 done indefinitely, only resuming once more files were dropped in (which
  // changed `entries` and re-armed the old effect once). entriesRef always holds the
  // latest entries without being a dependency, so this interval keeps ticking for the
  // component's whole lifetime regardless of whether any given poll changes anything.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = entriesRef.current.filter((e) => e.status === "processing" && e.assetId);
      if (pending.length === 0) return;

      const ids = pending.map((e) => e.assetId!).join(",");
      const res = await fetch(`/api/upload/status?ids=${ids}`);
      const { items } = (await res.json()) as {
        items: { id: string; status: string; errorMessage: string | null; groupId: string | null; isGroupPrimary: boolean }[];
      };
      for (const item of items) {
        const entry = pending.find((e) => e.assetId === item.id);
        if (!entry) continue;
        if (item.status === "ready") {
          const galleryId = entry.targetGalleryId !== undefined ? entry.targetGalleryId : galleryIdRef.current;
          if (galleryId && isAttachEligible(item.groupId, item.isGroupPrimary)) {
            await addToGallery(galleryId, item.id).catch(() => {});
          }
          patchEntry(entry.id, { status: "done" });
        } else if (item.status === "failed") {
          patchEntry(entry.id, { status: "error", error: item.errorMessage ?? "ingest failed" });
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [patchEntry]);

  const processOne = useCallback(
    async (entry: Entry, batchId: string) => {
      try {
        patchEntry(entry.id, { status: "hashing" });
        const sha256 = await hashFile(entry.file);

        const targetGalleryId = entry.targetGalleryId !== undefined ? entry.targetGalleryId : galleryIdRef.current;

        const check = await checkDuplicate(sha256, batchId, duplicateMode);
        if (check.exists && !check.keep) {
          const galleryId = targetGalleryId;
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
        const outcome = await uploadFile(entry.file, sha256, batchId, targetGalleryId, (fraction) =>
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
    async (files: FileToUpload[]) => {
      const supported = files.filter((f) => classifyKind(f.file.name) !== null);
      const unsupported = files.filter((f) => classifyKind(f.file.name) === null);

      const newEntries: Entry[] = [
        ...supported.map((f) => ({
          id: crypto.randomUUID(),
          file: f.file,
          status: "queued" as const,
          progress: 0,
          targetGalleryId: f.galleryId,
        })),
        ...unsupported.map((f) => ({
          id: crypto.randomUUID(),
          file: f.file,
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
      // Only needed if at least one file in *this* batch has no per-file
      // targetGalleryId of its own -- a fully organized folder drop (every file
      // routed to its own gallery via organize-drop.ts) has nothing for
      // resolveGalleryId to do. Calling it unconditionally used to mean a batch
      // that was entirely per-file-targeted still failed outright whenever
      // resolveGalleryId itself required something that wasn't there (e.g. the
      // folder page's "type a title first" fallback, which throws on an empty
      // title) -- confirmed live: an organized drop where every file already had
      // its own destination still errored with "type a gallery title above" before
      // a single file was processed, because this ran regardless.
      const needsSharedGalleryId = supported.some((f) => f.galleryId === undefined);
      // Ids to leave out of the queue below -- can't rely on newEntries' own status
      // field for this (it's a plain snapshot array from the map() calls above, not
      // connected to the setEntries call that marks them "error"), so track it
      // separately instead of the `return`-the-whole-batch this replaced.
      const resolveFailedIds = new Set<string>();
      if (needsSharedGalleryId) {
        try {
          galleryIdRef.current = resolveGalleryId ? await resolveGalleryId() : null;
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed to resolve destination";
          for (const e of newEntries) {
            if (e.status === "queued" && e.targetGalleryId === undefined) resolveFailedIds.add(e.id);
          }
          setEntries((prev) =>
            prev.map((e) => (resolveFailedIds.has(e.id) ? { ...e, status: "error", error: message } : e)),
          );
          // Per-file-targeted entries (an organized folder drop's own galleries)
          // are unaffected and still get processed below -- only entries that
          // actually needed the shared resolver are cut from the queue.
        }
      }

      const { batchId } = await createBatch(supported.length);

      const queue = newEntries.filter((e) => e.status === "queued" && !resolveFailedIds.has(e.id));
      if (queue.length === 0) {
        setRunning(false);
        return;
      }
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

  // Auto-resume sweep, once per mount: picks up any multipart upload that was left
  // in IndexedDB by a previous session of this same component -- the tab getting
  // suspended and reloaded, the browser fully closed and reopened later, whatever
  // -- and re-launches it from its stored bytes, no re-selecting the file required.
  // This is the actual point of pending-uploads-db.ts: it's what "the upload
  // should continue even if I close the browser" resolves to in a browser, where
  // no page's code can keep transferring bytes while it isn't running at all.
  useEffect(() => {
    let cancelled = false;
    listPendingUploads().then((pending) => {
      if (cancelled || pending.length === 0) return;
      const files: FileToUpload[] = pending.map((p) => ({
        file: new File([p.fileBlob], p.fileName, { type: p.mime }),
        galleryId: p.galleryId,
      }));
      runBatch(files);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only.
  }, []);

  return { entries, running, runBatch };
}
