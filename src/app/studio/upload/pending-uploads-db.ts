// Persists in-progress multipart uploads (videos and anything else over the 50MB
// threshold -- see upload-lib.ts's MULTIPART_THRESHOLD) to IndexedDB, including the
// file's own bytes. This is the actual answer to "the upload should continue even
// if I close the browser and open another app": no web page can keep transferring
// bytes while its tab is backgrounded (that's an OS-level restriction on mobile,
// not something any site's code controls), but IndexedDB can hold onto the file
// and which parts already succeeded across the tab being suspended, reloaded, or
// even the browser being fully closed and reopened later -- so coming back means
// resuming the rest of a multi-hundred-MB video, not re-uploading it from byte
// zero. Scoped to multipart only: small files finish fast enough that this
// wouldn't meaningfully help, and storing every file's bytes for the sub-50MB case
// would just be wasted IndexedDB space for no real benefit.
const DB_NAME = "mmp-uploads";
const STORE = "pending";
const DB_VERSION = 1;

export type PendingUpload = {
  sha256: string;
  fileBlob: Blob;
  fileName: string;
  mime: string;
  size: number;
  storageKey: string;
  uploadId: string;
  partSize: number;
  totalParts: number;
  completedParts: { partNumber: number; etag: string }[];
  batchId: string;
  /** Resolved once at the start and stored, not re-resolved on resume -- the
   * gallery/folder context (and any per-file organize-drop target) that was true
   * when the upload started is what should still apply when it finishes, not
   * whatever the page happens to be showing whenever the visitor comes back. */
  galleryId: string | null;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "sha256" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  // IndexedDB isn't available everywhere (private-browsing restrictions on some
  // browsers, e.g.) -- resumability is a nice-to-have on top of the retry logic
  // that already exists, not something an upload should fail outright without.
  try {
    await withStore("readwrite", (store) => store.put(upload));
  } catch {
    // Swallowed deliberately -- see comment above.
  }
}

export async function updatePendingUploadParts(sha256: string, completedParts: PendingUpload["completedParts"]): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const getReq = store.get(sha256);
        getReq.onsuccess = () => {
          const existing = getReq.result as PendingUpload | undefined;
          if (!existing) return resolve();
          const putReq = store.put({ ...existing, completedParts });
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // Non-fatal -- worst case a resume re-uploads a part that actually finished.
  }
}

export async function deletePendingUpload(sha256: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(sha256));
  } catch {
    // Non-fatal -- an orphaned record just means a future resume attempt for
    // content that's actually already fully uploaded, which upload/check's normal
    // dedup handles fine regardless.
  }
}

export async function getPendingUpload(sha256: string): Promise<PendingUpload | undefined> {
  try {
    return await withStore("readonly", (store) => store.get(sha256));
  } catch {
    return undefined;
  }
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
  try {
    return await withStore("readonly", (store) => store.getAll());
  } catch {
    return [];
  }
}
