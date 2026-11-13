import type { GalleryImage } from "@/lib/public-site/resolve";

/**
 * Full-bleed opening frame for a gallery: the cover photo, its title in light Fraunces
 * over a soft bottom gradient, the shoot date, and a "View gallery" link down to the
 * photos. A plain anchor, so it works without JavaScript. The blurred placeholder
 * paints instantly under the photo, which loads eagerly as the page's LCP element.
 * `fill` sizes it to the whole viewport (a client link, with nothing above it) or a
 * little less (below the public site's navigation bar).
 */
export function GalleryCover({
  title,
  dateLabel,
  image,
  eyebrow,
  fill,
}: {
  title: string;
  dateLabel: string | null;
  image: GalleryImage;
  eyebrow?: string;
  fill: "screen" | "below-nav";
}) {
  const { urls } = image;
  const srcSet = (format: "avif" | "webp") =>
    [urls[`${format}1200`] && `${urls[`${format}1200`]} 1200w`, urls[`${format}2560`] && `${urls[`${format}2560`]} 2560w`]
      .filter(Boolean)
      .join(", ");

  return (
    <header
      className={`relative flex items-end overflow-hidden bg-neutral-900 bg-cover bg-center text-white ${
        fill === "screen" ? "min-h-svh" : "min-h-[85svh]"
      }`}
      style={image.lqip ? { backgroundImage: `url(${image.lqip})` } : undefined}
    >
      <picture>
        {srcSet("avif") ? <source type="image/avif" srcSet={srcSet("avif")} sizes="100vw" /> : null}
        <img
          src={urls.webp2560 ?? urls.webp1200}
          srcSet={srcSet("webp") || undefined}
          sizes="100vw"
          alt=""
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ animation: "hero-settle 1.6s var(--ease-settle) both" }}
        />
      </picture>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

      <div
        className="relative mx-auto w-full max-w-6xl px-6 pb-12 sm:pb-20"
        style={{ animation: "reveal-up var(--dur-slow) var(--ease-settle) 200ms both" }}
      >
        {eyebrow ? <p className="text-xs uppercase tracking-[0.25em] text-white/70">{eyebrow}</p> : null}
        <h1
          className="mt-3 max-w-4xl text-4xl leading-tight sm:text-6xl"
          style={{ fontFamily: "var(--font-display)", fontWeight: 300, textWrap: "balance" }}
        >
          {title}
        </h1>
        {dateLabel ? <p className="mt-3 text-sm tracking-wide text-white/80">{dateLabel}</p> : null}
        <a
          href="#photos"
          className="mt-8 inline-flex items-center gap-2 rounded border border-white/60 px-5 py-2.5 text-sm tracking-wide text-white transition-colors duration-200 hover:bg-white hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
        >
          View gallery
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </a>
      </div>
    </header>
  );
}
