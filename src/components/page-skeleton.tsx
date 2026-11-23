/**
 * What a public page shows while its server render is still on the way (the route's
 * loading.tsx). Without one, a click on a folder or gallery did nothing visible until
 * the whole page arrived, and Next prefetched each linked page in full; with one, the
 * click answers at once and prefetching stops at this boundary.
 *
 * Static on purpose: the dark bar and the neutral blocks are the same ground the real
 * page paints before its photos load, with no animation (no new effect to approve).
 * The bar is drawn here rather than by PublicShell because PublicShell reads the
 * database, which is exactly what a loading state can't wait for.
 */
const BLOCK = "rounded bg-neutral-100";

function Bar() {
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <span className="h-9 w-9 rounded-full bg-white/5" />
        <span className="h-3 w-24 rounded bg-white/10" />
      </div>
    </div>
  );
}

/** Tile heights that read as a photo grid rather than a table. */
const TILE_HEIGHTS = ["h-48", "h-64", "h-56", "h-64", "h-48", "h-56"];

/** "grid": folders, galleries and search (one route serves folders and galleries, so
 * it can't know which is coming). "client": a client link, which has no site bar and
 * opens on a full-screen cover. */
export function PageSkeleton({ variant }: { variant: "grid" | "client" }) {
  return (
    <div className="min-h-screen" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {variant === "client" ? null : <Bar />}
      {variant === "client" ? <div className="h-screen bg-neutral-100" /> : null}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 h-3 w-40 rounded bg-neutral-100" />
        <div className="mb-8 h-7 w-64 rounded bg-neutral-100" />
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {TILE_HEIGHTS.map((h, i) => (
            <div key={i} className={`${BLOCK} ${h}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
