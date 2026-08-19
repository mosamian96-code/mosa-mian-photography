"use client";

import { useCallback, useEffect, useState } from "react";

type LibraryItem = {
  id: string;
  filename: string;
  kind: string;
  capturedAt: string | null;
  importedAt: string;
  lqip: string | null;
  width: number | null;
  height: number | null;
  camera: string | null;
  thumbUrl: string | null;
};

type LibraryResponse = {
  items: LibraryItem[];
  nextOffset: number | null;
  counts: Record<string, number>;
};

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [camera, setCamera] = useState("");
  const [kind, setKind] = useState("");

  const load = useCallback(
    async (offset: number, reset: boolean) => {
      setLoading(true);
      const params = new URLSearchParams({ offset: String(offset) });
      if (camera) params.set("camera", camera);
      if (kind) params.set("kind", kind);
      const res = await fetch(`/api/library?${params}`);
      const data: LibraryResponse = await res.json();
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setNextOffset(data.nextOffset);
      setCounts(data.counts);
      setLoading(false);
    },
    [camera, kind],
  );

  useEffect(() => {
    // Standard fetch-on-mount/filter-change: the setState calls are in load()'s async
    // continuation, not synchronous in this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(0, true);
  }, [load]);

  const inProgress = (counts.pending ?? 0) + (counts.processing ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-900">Library</h1>
        <a
          href="/studio/upload"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Upload
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
        {inProgress > 0 ? <span>{inProgress} still processing</span> : null}
        {counts.failed ? <span className="text-red-600">{counts.failed} failed</span> : null}
        <input
          type="text"
          placeholder="Filter by camera"
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        >
          <option value="">All types</option>
          <option value="raw">RAW</option>
          <option value="jpeg">JPEG</option>
          <option value="heic">HEIC</option>
        </select>
      </div>

      {items.length === 0 && !loading ? (
        <p className="mt-10 text-sm text-neutral-400">Nothing here yet — upload some photos to get started.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <figure key={item.id} className="group relative aspect-square overflow-hidden rounded bg-neutral-100">
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl}
                  alt={item.filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  style={item.lqip ? { backgroundImage: `url(${item.lqip})`, backgroundSize: "cover" } : undefined}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                  {item.kind}
                </div>
              )}
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {item.filename}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {nextOffset !== null ? (
        <button
          type="button"
          onClick={() => load(nextOffset, false)}
          disabled={loading}
          className="mt-6 rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
