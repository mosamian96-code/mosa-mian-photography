"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ assetIds, label }: { assetIds?: string[]; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [retried, setRetried] = useState(0);

  async function retry() {
    setState("working");
    try {
      const res = await fetch("/api/library/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetIds ? { assetIds } : {}),
      });
      if (!res.ok) throw new Error();
      const { retried } = (await res.json()) as { retried: number };
      setRetried(retried);
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400">
        {retried === 1 ? "Queued for processing" : `${retried} queued for processing`}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={state === "working"}
      className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100"
    >
      {state === "working" ? "Queuing…" : state === "error" ? "Failed — try again" : label}
    </button>
  );
}
