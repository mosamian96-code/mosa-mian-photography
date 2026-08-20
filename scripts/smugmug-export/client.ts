import { type OAuthCredentials, signRequest } from "./oauth";

const MIN_REQUEST_INTERVAL_MS = 300; // ~3 req/s -- SmugMug publishes no hard limit, this is a polite default
const MAX_RETRIES = 6;

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

class PermanentError extends Error {}

/**
 * Retries both HTTP-level failures (429/5xx) and network-level ones (ECONNRESET,
 * DNS blips, TLS resets) -- a multi-day unattended run WILL hit transient network
 * errors eventually (confirmed live: an ECONNRESET killed the whole process on the
 * first real multi-hour run since only HTTP status was being retried, not fetch()
 * itself throwing). A PermanentError (e.g. a genuine 404) skips retries entirely
 * instead of burning through backoff delays on something that will never succeed.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      if (attempt === MAX_RETRIES) throw err;
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[smugmug] ${label} failed (${message}), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

/** GET one SmugMug API v2 URL, signed, rate-limited, retried on both HTTP and network errors. */
export async function smugmugGet<T = unknown>(url: string, creds: OAuthCredentials): Promise<T> {
  return withRetry(`GET ${url}`, async () => {
    const res = await fetch(url, {
      headers: {
        Authorization: signRequest("GET", url, creds),
        Accept: "application/json",
      },
    });
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new PermanentError(`SmugMug API error ${res.status} on ${url}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  });
}

/** Downloads a binary URL (image original) to a Buffer, same throttle/retry policy. */
export async function smugmugDownload(url: string, creds: OAuthCredentials): Promise<Buffer> {
  return withRetry(`download ${url}`, async () => {
    const res = await fetch(url, { headers: { Authorization: signRequest("GET", url, creds) } });
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new PermanentError(`SmugMug download error ${res.status} on ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  });
}
