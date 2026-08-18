import { runHealthChecks } from "@/lib/health";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      aria-hidden
    />
  );
}

export default async function StudioDashboard() {
  const health = await runHealthChecks();

  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900">Foundation health</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Postgres, Redis, and a B2 round-trip (write, read, delete a test object), checked live.
      </p>
      <dl className="mt-6 divide-y divide-neutral-200 rounded border border-neutral-200">
        {Object.entries(health.checks).map(([name, check]) => (
          <div key={name} className="flex items-center justify-between px-4 py-3">
            <dt className="flex items-center gap-2 text-sm capitalize text-neutral-900">
              <StatusDot ok={check.ok} />
              {name}
            </dt>
            <dd className="text-sm text-neutral-500">
              {check.ok ? `${check.latencyMs}ms` : (check.error ?? "failed")}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-neutral-400">Checked {health.timestamp}</p>
    </div>
  );
}
