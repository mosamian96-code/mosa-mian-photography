import Link from "next/link";
import { FocusFrame } from "@/components/focus-frame";
import { RevealOnView } from "@/components/reveal-on-view";
import type { FolderSection } from "@/lib/public-site/resolve";

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
        <div className={`grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 ${depth > 0 ? "mt-4" : ""}`}>
          {section.galleries.map((g, i) => (
            <RevealOnView key={g.id} delayMs={i * 40}>
              <Link href={`/${[...pathSegments, g.slug].join("/")}`} data-cursor="view" className="group relative block">
                <div
                  className="relative overflow-hidden bg-neutral-100 bg-cover bg-center"
                  style={{
                    aspectRatio: "4/3",
                    ...(g.coverLqip ? { backgroundImage: `url(${g.coverLqip})` } : undefined),
                  }}
                >
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.coverUrl}
                      alt={g.title}
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
          ))}
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
