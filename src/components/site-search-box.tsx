"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SiteSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="w-32 rounded border border-neutral-300 px-2.5 py-1 text-sm outline-none focus:border-neutral-900 sm:w-40"
      />
    </form>
  );
}
