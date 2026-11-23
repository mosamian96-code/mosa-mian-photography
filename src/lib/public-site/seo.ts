import type { Metadata } from "next";

export const SITE_NAME = "Mosa Mian Photography";
export const DEFAULT_DESCRIPTION = "Photography by Mosa Mian: weddings, events, portraits and travel.";

/** The public origin, for absolute URLs in share previews and structured data.
 * AUTH_URL is already the site's public address in every deployment. */
export function siteOrigin(): URL {
  try {
    return new URL(process.env.AUTH_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** Open Graph + Twitter card fields for one page. `image` is an absolute URL (a
 * cover derivative on the CDN) or nothing. */
export function shareMetadata(input: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; width?: number | null; height?: number | null } | null;
}): Pick<Metadata, "openGraph" | "twitter" | "alternates"> {
  const images = input.image
    ? [{ url: input.image.url, width: input.image.width ?? undefined, height: input.image.height ?? undefined, alt: input.title }]
    : undefined;
  return {
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      url: input.path,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      images: images?.map((i) => i.url),
    },
  };
}

/** JSON for a <script type="application/ld+json"> tag. "<" is escaped so a title
 * containing "</script>" can't end the tag early. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
