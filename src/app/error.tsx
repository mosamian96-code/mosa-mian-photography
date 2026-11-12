"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Next.js's per-segment error boundary -- catches a thrown error anywhere in a page's
 * render/data-fetching and shows this instead of either a blank screen or (in dev) a
 * stack trace that would otherwise be exposed to visitors in a misconfigured prod
 * build. Never shows `error.message` to the visitor -- it can contain internal detail
 * (a DB error string, a file path) that only belongs in the server-side log. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `${error.message}${error.digest ? ` (digest: ${error.digest})` : ""}` }),
    }).catch(() => {});
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Something went wrong</p>
      <h1
        className="mt-3 text-3xl text-neutral-900 sm:text-4xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, textWrap: "balance" }}
      >
        This page hit a snag
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500">
        It&apos;s been logged. Try again, or head back to the homepage.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Back to the homepage
        </Link>
      </div>
    </main>
  );
}
