import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

/**
 * Fixed-window counters in Redis, for the endpoints anyone can call: sign-in, gallery
 * and client-link passwords, password reset, the contact form and client error
 * reports. Without them a script could guess passwords indefinitely, and since each
 * guess runs scrypt (deliberately slow, ~50ms of CPU), a burst of guesses also slowed
 * the whole 2-vCPU server.
 *
 * Fails open: if Redis is slow or down, requests go through unlimited rather than the
 * site's login and contact form breaking with it.
 */

type Window = { limit: number; windowSeconds: number };

const REDIS_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REDIS_TIMEOUT_MS)),
  ]);
}

function key(bucket: string, id: string) {
  return `rl:${bucket}:${id.toLowerCase().slice(0, 200)}`;
}

/** The visitor's IP as Cloudflare reports it. Only used to group attempts, never
 * trusted for anything else: a request that reaches the origin directly could set
 * this header itself, which at worst puts it in its own rate-limit bucket. */
export function requestIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/** Counts this request; returns seconds to wait if it's over the limit, else 0. */
export async function countRequest(bucket: string, id: string, window: Window): Promise<number> {
  const k = key(bucket, id);
  const result = await withTimeout(redis.multi().incr(k).expire(k, window.windowSeconds, "NX").ttl(k).exec());
  if (!result) return 0;
  const count = Number(result[0]?.[1] ?? 0);
  const ttl = Number(result[2]?.[1] ?? window.windowSeconds);
  return count > window.limit ? Math.max(ttl, 1) : 0;
}

/** Counts this request and answers 429 when the caller is over the limit. */
export async function rateLimit(bucket: string, id: string, window: Window): Promise<Response | null> {
  const retryAfter = await countRequest(bucket, id, window);
  return retryAfter ? tooManyRequests(retryAfter) : null;
}

export function tooManyRequests(retryAfter: number) {
  const minutes = Math.ceil(retryAfter / 60);
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Failed-attempt counting for passwords: only wrong guesses count, so someone who
 * types the right password is never slowed down, and a success clears the count.
 */
export const failedAttempts = {
  /** Seconds until another attempt is allowed, or 0. Doesn't count anything. */
  async blockedFor(bucket: string, id: string, window: Window): Promise<number> {
    const k = key(bucket, id);
    const result = await withTimeout(redis.multi().get(k).ttl(k).exec());
    if (!result) return 0;
    const count = Number(result[0]?.[1] ?? 0);
    const ttl = Number(result[1]?.[1] ?? 0);
    return count >= window.limit && ttl > 0 ? ttl : 0;
  },
  async record(bucket: string, id: string, window: Window): Promise<void> {
    const k = key(bucket, id);
    await withTimeout(redis.multi().incr(k).expire(k, window.windowSeconds, "NX").exec());
  },
  async clear(bucket: string, id: string): Promise<void> {
    await withTimeout(redis.del(key(bucket, id)));
  },
};
