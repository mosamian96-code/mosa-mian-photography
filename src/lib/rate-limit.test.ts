import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the few Redis commands the limiter uses.
const store = new Map<string, { value: number; expiresAt: number }>();
function live(key: string) {
  const entry = store.get(key);
  if (entry && entry.expiresAt <= Date.now()) store.delete(key);
  return store.get(key);
}
function multi() {
  const ops: (() => unknown)[] = [];
  const chain = {
    incr(key: string) {
      ops.push(() => {
        const entry = live(key) ?? { value: 0, expiresAt: Infinity };
        entry.value += 1;
        store.set(key, entry);
        return entry.value;
      });
      return chain;
    },
    expire(key: string, seconds: number) {
      ops.push(() => {
        const entry = live(key);
        if (entry && entry.expiresAt === Infinity) entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
      });
      return chain;
    },
    ttl(key: string) {
      ops.push(() => {
        const entry = live(key);
        return entry ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : -2;
      });
      return chain;
    },
    get(key: string) {
      ops.push(() => (live(key) ? String(live(key)!.value) : null));
      return chain;
    },
    async exec() {
      return ops.map((op) => [null, op()]);
    },
  };
  return chain;
}
vi.mock("@/lib/redis", () => ({
  redis: { multi, del: async (key: string) => store.delete(key) },
}));

const { countRequest, failedAttempts, requestIp } = await import("./rate-limit");

beforeEach(() => store.clear());

describe("countRequest", () => {
  it("allows up to the limit, then asks the caller to wait", async () => {
    const window = { limit: 2, windowSeconds: 60 };
    expect(await countRequest("t", "ip", window)).toBe(0);
    expect(await countRequest("t", "ip", window)).toBe(0);
    expect(await countRequest("t", "ip", window)).toBeGreaterThan(0);
    // Other callers have their own count.
    expect(await countRequest("t", "other-ip", window)).toBe(0);
  });
});

describe("failedAttempts", () => {
  it("blocks after the limit of wrong guesses and clears on success", async () => {
    const window = { limit: 3, windowSeconds: 900 };
    for (let i = 0; i < 3; i++) await failedAttempts.record("pw", "ip:g1", window);
    expect(await failedAttempts.blockedFor("pw", "ip:g1", window)).toBeGreaterThan(0);
    await failedAttempts.clear("pw", "ip:g1");
    expect(await failedAttempts.blockedFor("pw", "ip:g1", window)).toBe(0);
  });
});

describe("requestIp", () => {
  it("prefers Cloudflare's header, then the first forwarded address", () => {
    expect(requestIp(new Request("http://x", { headers: { "cf-connecting-ip": "1.2.3.4" } }))).toBe("1.2.3.4");
    expect(requestIp(new Request("http://x", { headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" } }))).toBe("5.6.7.8");
    expect(requestIp(new Request("http://x"))).toBe("unknown");
  });
});
