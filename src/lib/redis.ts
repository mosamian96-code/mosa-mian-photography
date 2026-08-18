import Redis from "ioredis";

// Shared connection for BullMQ queues (Phase 2+) and ad-hoc checks (health route).
// `lazyConnect` so importing this module never opens a socket by itself.
export const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
