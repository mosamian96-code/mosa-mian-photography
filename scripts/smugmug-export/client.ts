import { type OAuthCredentials, signRequest } from "./oauth";

const MIN_REQUEST_INTERVAL_MS = 300; // ~3 req/s -- SmugMug publishes no hard limit, this is a polite default
const MAX_RETRIES = 6;

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** GET one SmugMug API v2 URL, signed, rate-limited, retried on 429/5xx with backoff. */
export async function smugmugGet<T = unknown>(url: string, creds: OAuthCredentials): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: {
        Authorization: signRequest("GET", url, creds),
        Accept: "application/json",
      },
    });

    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(`[smugmug] ${res.status} on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) {
      throw new Error(`SmugMug API error ${res.status} on ${url}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
  throw new Error(`SmugMug API: exhausted retries on ${url}`);
}

/** Downloads a binary URL (image original) to a Buffer, same throttle/retry policy. */
export async function smugmugDownload(url: string, creds: OAuthCredentials): Promise<Buffer> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { Authorization: signRequest("GET", url, creds) } });

    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(`[smugmug] ${res.status} downloading ${url}, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) {
      throw new Error(`SmugMug download error ${res.status} on ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`SmugMug download: exhausted retries on ${url}`);
}
