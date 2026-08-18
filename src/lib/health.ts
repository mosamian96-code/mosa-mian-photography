import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { db } from "@/lib/db";
import { healthChecks } from "@/lib/db/schema";
import { deleteObject, getObjectText, putObject } from "@/lib/storage";

type CheckResult = { ok: boolean; latencyMs?: number; error?: string };

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  await db.execute(sql`select 1`);
  return { ok: true, latencyMs: Date.now() - start };
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  // A dedicated, fail-fast connection — not the shared @/lib/redis client, which BullMQ
  // (Phase 2+) needs configured for indefinite retry instead of a quick failure here.
  const client = new Redis(process.env.REDIS_URL!, {
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  try {
    const pong = await client.ping();
    return { ok: pong === "PONG", latencyMs: Date.now() - start };
  } finally {
    client.disconnect();
  }
}

async function checkStorage(): Promise<CheckResult> {
  const start = Date.now();
  const key = `health/${Date.now()}-${crypto.randomUUID()}.txt`;
  const body = `ok:${Date.now()}`;
  await putObject(key, body, "text/plain");
  const readBack = await getObjectText(key);
  await deleteObject(key);
  return { ok: readBack === body, latencyMs: Date.now() - start };
}

export async function runHealthChecks() {
  const [database, redisCheck, storage] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
  ]);

  const toResult = (r: PromiseSettledResult<CheckResult>): CheckResult =>
    r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message ?? "unknown error" };

  const checks = {
    database: toResult(database),
    redis: toResult(redisCheck),
    storage: toResult(storage),
  };

  const ok = Object.values(checks).every((c) => c.ok);

  // Best-effort audit row; the health verdict does not depend on this write succeeding.
  if (checks.database.ok) {
    await db
      .insert(healthChecks)
      .values({ storageOk: checks.storage.ok, redisOk: checks.redis.ok })
      .catch(() => undefined);
  }

  return { ok, checks, timestamp: new Date().toISOString() };
}
