// SHA-256 via SubtleCrypto rather than a dedicated Web Worker: SubtleCrypto's digest
// already runs off the main JS thread and returns a Promise, so the UI doesn't freeze
// while it works — the brief's "computed in a Web Worker" (section 6) is really after
// a non-blocking hash, which this already is, without the extra bundler surface area
// a real worker script adds. See DECISIONS.md.
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json();
}

export type DuplicateMode = "skip" | "keep";

export type CheckResult = {
  exists: boolean;
  keep?: boolean;
  assetId?: string;
  status?: string;
  groupId?: string | null;
  isGroupPrimary?: boolean;
  storageKey?: string;
};

export function checkDuplicate(sha256: string, batchId: string, mode: DuplicateMode = "skip") {
  return api<CheckResult>("/api/upload/check", { sha256, batchId, mode });
}

export function createBatch(totalFiles: number) {
  return api<{ batchId: string }>("/api/upload/batch", { totalFiles });
}

// A RAW+JPEG+.xmp trio sharing a basename collapses into one asset_group with a
// single "primary" (the ingest worker's pick for what's actually displayable) --
// attaching every sibling to a gallery would create redundant/broken items for the
// ones that aren't it, so callers should only attach when this is true.
export function isAttachEligible(groupId: string | null | undefined, isGroupPrimary: boolean | undefined) {
  return !groupId || Boolean(isGroupPrimary);
}

export function addToGallery(galleryId: string, assetId: string) {
  return api<{ ok: true; added: number }>(`/api/galleries/${galleryId}/items`, { assetIds: [assetId] });
}

type InitResult =
  | { mode: "single"; storageKey: string; uploadUrl: string }
  | { mode: "multipart"; storageKey: string; uploadId: string; partSize: number; totalParts: number };

export function initUpload(sha256: string, filename: string, size: number, mime: string) {
  return api<InitResult>("/api/upload/init", { sha256, filename, size, mime });
}

const UPLOAD_RETRIES = 4;

/** A large file over a flaky connection (mobile data is the common case -- a phone
 * video is often hundreds of MB, easily minutes over cellular, during which a tower
 * handoff or a WiFi/cellular switch can reset an in-flight request) has no server
 * side to report a failure to when the browser's fetch() itself can't complete --
 * that's a bare "Failed to fetch" with nothing logged anywhere, confirmed live for a
 * phone video upload. A single dropped connection used to kill the whole upload
 * immediately; retrying with backoff turns a transient blip into (at worst) a short
 * pause instead of "start the whole file over from your phone." */
async function withRetry<T>(fn: (attempt: number) => Promise<T>, retries = UPLOAD_RETRIES): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** PUT via XMLHttpRequest, not fetch(): fetch has no upload-progress event at all --
 * body upload is opaque until the whole request settles, which is exactly why the
 * single-file path below used to jump straight from 0% to 100% with nothing in
 * between (fine for a photo, useless for an ETA on a multi-hundred-MB video, the
 * point of adding this). xhr.upload.onprogress reports real bytes sent as the OS
 * actually sends them, which is what makes a live ETA meaningful instead of a guess. */
function xhrPut(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (loaded: number) => void,
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(body.size);
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new Error(`upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("network error during upload"));
    xhr.send(body);
  });
}

async function uploadSingle(file: File, uploadUrl: string, mime: string, onProgress?: (loaded: number) => void) {
  await withRetry(async () => {
    onProgress?.(0);
    await xhrPut(uploadUrl, file, { "Content-Type": mime }, onProgress);
  });
}

const PART_CONCURRENCY = 4;

async function uploadMultipart(
  file: File,
  storageKey: string,
  uploadId: string,
  partSize: number,
  totalParts: number,
  onProgress?: (loaded: number) => void,
) {
  const parts: { partNumber: number; etag: string }[] = [];
  let nextPart = 1;
  // Bytes actually sent so far, per part number -- up to PART_CONCURRENCY parts are
  // in flight at once, each reporting its own progress independently, so the
  // caller needs the *sum* across all of them, not any single part's fraction.
  const loadedByPart = new Map<number, number>();
  const reportTotal = () => onProgress?.([...loadedByPart.values()].reduce((a, b) => a + b, 0));

  async function worker() {
    for (;;) {
      const partNumber = nextPart++;
      if (partNumber > totalParts) return;

      const start = (partNumber - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));

      const etag = await withRetry(async () => {
        loadedByPart.set(partNumber, 0);
        // Re-requested on every attempt, not just the first: a presigned URL is
        // only good for 15 minutes, and re-fetching costs nothing on a normal
        // first try but means a retry after a slow/stalled attempt doesn't hand
        // back a URL that's already close to (or past) its own expiry.
        const { url } = await api<{ url: string }>("/api/upload/part-url", { storageKey, uploadId, partNumber });
        const { etag } = await xhrPut(url, blob, {}, (loaded) => {
          loadedByPart.set(partNumber, loaded);
          reportTotal();
        });
        if (!etag) {
          throw new Error("upload succeeded but no ETag came back (check B2 bucket CORS ExposeHeaders)");
        }
        return etag;
      });

      parts.push({ partNumber, etag });
    }
  }

  await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, totalParts) }, worker));
  return parts;
}

export type UploadOutcome = { assetId: string; deduped: boolean };

export async function uploadFile(
  file: File,
  sha256: string,
  batchId: string,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome> {
  const plan = await initUpload(sha256, file.name, file.size, file.type || "application/octet-stream");

  let parts: { partNumber: number; etag: string }[] | undefined;
  if (plan.mode === "single") {
    await uploadSingle(file, plan.uploadUrl, file.type || "application/octet-stream", (loaded) =>
      onProgress?.(loaded / file.size),
    );
  } else {
    parts = await uploadMultipart(file, plan.storageKey, plan.uploadId, plan.partSize, plan.totalParts, (loaded) =>
      onProgress?.(loaded / file.size),
    );
  }

  return api<UploadOutcome>("/api/upload/complete", {
    storageKey: plan.storageKey,
    uploadId: plan.mode === "multipart" ? plan.uploadId : undefined,
    parts,
    sha256,
    filename: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    batchId,
  });
}

/** "Keep duplicates" path: the file's bytes are already in storage under
 * existingStorageKey (checkDuplicate's "keep" response) -- content-addressed, so
 * there's genuinely nothing new to upload -- this only creates the second,
 * independent asset row via forceNewCopy. */
export function completeDuplicate(
  existingStorageKey: string,
  sha256: string,
  file: File,
  batchId: string,
): Promise<UploadOutcome> {
  return api<UploadOutcome>("/api/upload/complete", {
    storageKey: existingStorageKey,
    sha256,
    filename: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    batchId,
    forceNewCopy: true,
  });
}
