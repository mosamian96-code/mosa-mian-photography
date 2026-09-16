"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FocusFrame } from "@/components/focus-frame";
import { JustifiedGrid } from "@/components/justified-grid";
import { RevealOnView } from "@/components/reveal-on-view";
import type { FolderSection } from "@/lib/public-site/resolve";

// Same small/medium/large row-height pattern as the in-gallery photo grid
// (gallery-view.tsx) -- a distinct localStorage key since "how big should folder
// tiles be" and "how big should photos inside a gallery be" are different per-visitor
// preferences, not one shared setting. 320 (medium) matches this grid's prior fixed
// row height, so switching to it is a visual no-op.
const SIZE_OPTIONS = [
  { key: "small", label: "S", rowHeight: 200 },
  { key: "medium", label: "M", rowHeight: 320 },
  { key: "large", label: "L", rowHeight: 480 },
] as const;
type GridSize = (typeof SIZE_OPTIONS)[number]["key"];
const GRID_SIZE_STORAGE_KEY = "mm-folder-grid-size";

function isGridSize(value: string | null): value is GridSize {
  return value === "small" || value === "medium" || value === "large";
}

// Client component (not the server component it was before JustifiedGrid was added
// here) solely because JustifiedGrid takes a renderItem function prop -- Server
// Components can't pass functions across to a Client Component (confirmed live:
// "Functions cannot be passed directly to Client Components" crashed every folder
// and homepage request right after deploy). This component does no data fetching of
// its own -- section is already-resolved data passed in as a prop -- so becoming a
// client component costs a bit of extra client JS, not a broken data-fetching model.

/** Renders a folder's own galleries as a cover-photo grid, then recurses into each
 * subfolder as its own titled section below -- mirrors SmugMug's folder-page layout
 * (requested directly against the user's SmugMug site), which flattens the whole
 * subtree onto one page instead of a click-through per subfolder. Shared by the
 * folder-page route and the homepage, which embeds the portfolio root folder's grid
 * directly rather than leaving `/` as a bare hero with nothing below it. */
export function FolderSectionGrid({
  section,
  pathSegments,
  depth,
  rowHeight,
}: {
  section: FolderSection;
  pathSegments: string[];
  depth: number;
  /** Only meant to be passed by this component's own recursive calls to itself --
   * the top-level call (depth 0, no rowHeight given) owns the size toggle and
   * preference, and threads the chosen height down through every nested subsection
   * so the whole tree resizes together, not just whichever section you happened to
   * be looking at. */
  rowHeight?: number;
}) {
  const [gridSize, setGridSize] = useState<GridSize>("medium");
  const isRoot = rowHeight === undefined;

  useEffect(() => {
    if (!isRoot) return;
    const stored = localStorage.getItem(GRID_SIZE_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isGridSize(stored)) setGridSize(stored);
  }, [isRoot]);

  const changeGridSize = useCallback((size: GridSize) => {
    setGridSize(size);
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, size);
  }, []);

  const resolvedRowHeight = rowHeight ?? SIZE_OPTIONS.find((o) => o.key === gridSize)!.rowHeight;

  return (
    <div className={depth > 0 ? "mt-12" : "mt-8"}>
      {depth > 0 ? (
        <Link href={`/${pathSegments.join("/")}`} className="group inline-block">
          <h2
            className="text-xl text-neutral-900 transition-colors group-hover:text-neutral-500"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
          >
            {section.folder.title}
          </h2>
        </Link>
      ) : null}

      {isRoot ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          <div role="group" aria-label="Tile size" className="inline-flex rounded border border-neutral-200 bg-white p-0.5">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                aria-pressed={gridSize === opt.key}
                onClick={() => changeGridSize(opt.key)}
                title={`${opt.key[0].toUpperCase()}${opt.key.slice(1)} tiles`}
                className={`h-7 w-7 rounded text-xs tracking-wide transition-colors ${
                  gridSize === opt.key ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {section.galleries.length > 0 ? (
        <div className={depth > 0 ? "mt-4" : ""}>
          {/* Justified, not a fixed-aspect CSS grid: a forced 4/3 box with object-cover
              was cropping any cover photo that wasn't already 4/3 -- most landscape
              photography isn't. This lays each row out at its own photos' true aspect
              ratios (same approach as the in-gallery photo grid), so nothing gets
              cropped and wide photos naturally render wider/bigger instead of being
              squeezed into a box sized for a different shape. */}
          <JustifiedGrid
            items={section.galleries.map((g) => ({ id: g.id, aspect: g.coverAspect }))}
            targetRowHeight={resolvedRowHeight}
            gap={4}
            renderItem={(_item, width, height, i) => {
              const g = section.galleries[i];
              return (
                <RevealOnView delayMs={i * 40} className="h-full w-full">
                  <Link
                    href={`/${[...pathSegments, g.slug].join("/")}`}
                    data-cursor="view"
                    className="group relative block h-full w-full"
                  >
                    <div
                      className="relative h-full w-full overflow-hidden bg-neutral-100 bg-cover bg-center"
                      style={g.coverLqip ? { backgroundImage: `url(${g.coverLqip})` } : undefined}
                    >
                      {g.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.coverUrl}
                          alt={g.title}
                          width={width}
                          height={height}
                          className={`focus-image h-full w-full object-cover ${g.hoverUrl ? "transition-opacity duration-500 ease-out group-hover:opacity-0" : ""}`}
                        />
                      ) : null}
                      {g.hoverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.hoverUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
                      <FocusFrame />
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 py-2.5">
                        <GalleryGlyph />
                        <span className="truncate text-sm text-white">{g.title}</span>
                      </div>
                    </div>
                  </Link>
                </RevealOnView>
              );
            }}
          />
        </div>
      ) : null}

      {section.subsections.map((sub) => (
        <FolderSectionGrid
          key={sub.folder.id}
          section={sub}
          pathSegments={[...pathSegments, sub.folder.slug]}
          depth={depth + 1}
          rowHeight={resolvedRowHeight}
        />
      ))}
    </div>
  );
}

function GalleryGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-white/80">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 18 5-5 3 3 4-5 4 5" />
    </svg>
  );
}
