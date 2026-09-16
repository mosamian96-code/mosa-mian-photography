"use client";

import Link from "next/link";
import { FocusFrame } from "@/components/focus-frame";
import { JustifiedGrid } from "@/components/justified-grid";
import { RevealOnView } from "@/components/reveal-on-view";
import type { FolderSection } from "@/lib/public-site/resolve";

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
}: {
  section: FolderSection;
  pathSegments: string[];
  depth: number;
}) {
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
            targetRowHeight={320}
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
