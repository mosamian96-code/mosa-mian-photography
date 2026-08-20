"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Minimal entry point for search + keyword browsing (brief section 4 gap-fill) --
 * deliberately not a full site nav/homepage redesign, which is a separate, bigger
 * design decision (see DECISIONS.md, flagged but not undertaken here). */
export function PublicHeader() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <Link href="/keywords" className="text-neutral-400 hover:text-neutral-900">
        Browse by keyword
      </Link>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="w-40 rounded border border-neutral-300 px-2.5 py-1 text-sm outline-none focus:border-neutral-900"
        />
      </form>
    </div>
  );
}
