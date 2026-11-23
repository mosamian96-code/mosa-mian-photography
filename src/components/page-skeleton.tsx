/**
 * What the search page shows while results are on the way (search/loading.tsx), so a
 * search answers at once instead of appearing to do nothing.
 *
 * Only for routes that never 404 or redirect: a loading screen starts the response
 * with status 200, after which notFound() and permanentRedirect() can no longer set
 * 404/308. On the folder/gallery and client-link routes that turned every unknown URL
 * into a 200 "soft 404" and every old-URL redirect into a client-side one, so those
 * routes have no loading.tsx (caught by the e2e test for a removed endpoint).
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

export function PageSkeleton() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Bar />
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
