import type { Metadata } from "next";
import { FolderSectionGrid } from "@/components/folder-section-grid";
import { PublicShell } from "@/components/public-shell";
import { firstCoverUrl, listRootFolders, resolvePath } from "@/lib/public-site/resolve";
import { DEFAULT_DESCRIPTION, SITE_NAME, jsonLd, shareMetadata, siteOrigin } from "@/lib/public-site/seo";
import { getSiteSettings } from "@/lib/public-site/site-settings";

// Reads live site settings (tagline, hero photo) on every request -- without this,
// Next would statically prerender the homepage at build time and bake in whatever
// settings existed then, same class of bug already hit once with the Turnstile key on
// /contact.
export const dynamic = "force-dynamic";

/** The homepage embeds the portfolio root folder's own grid directly rather than
 * leaving `/` as a bare hero with nothing below it -- "portfolio" is whichever public
 * root folder sorts first, same folder the top nav links to. Shared by the page and
 * its metadata; resolvePath is cached per request, so this runs its queries once. */
async function loadPortfolio() {
  const rootFolders = await listRootFolders();
  const folder = rootFolders[0];
  const resolved = folder ? await resolvePath([folder.slug]) : null;
  return { folder, section: resolved?.type === "folder" ? resolved.section : null };
}

export async function generateMetadata(): Promise<Metadata> {
  const [settings, { section }] = await Promise.all([getSiteSettings(), loadPortfolio()]);
  const description = settings.tagline?.trim() || DEFAULT_DESCRIPTION;
  const cover = section ? firstCoverUrl(section) : null;
  return {
    title: SITE_NAME,
    description,
    ...shareMetadata({ title: SITE_NAME, description, path: "/", image: cover ? { url: cover } : null }),
  };
}

export default async function Home() {
  const [settings, { folder: portfolioFolder, section: portfolioSection }] = await Promise.all([
    getSiteSettings(),
    loadPortfolio(),
  ]);

  // Structured data so search engines can show the photographer's name and profiles
  // as a knowledge panel. Only filled-in social links are listed.
  const sameAs = [settings.socialInstagram, settings.socialFacebook, settings.socialLinkedin].filter(
    (url): url is string => Boolean(url && /^https?:\/\//i.test(url.trim())),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Mosa Mian",
    jobTitle: "Photographer",
    url: siteOrigin().origin,
    description: settings.tagline?.trim() || DEFAULT_DESCRIPTION,
    ...(sameAs.length ? { sameAs } : {}),
  };

  return (
    <PublicShell>
      {/* A data block, not a script that runs, so the CSP's script-src doesn't apply. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />

      <div className="mx-auto max-w-6xl px-4 pb-4 pt-14 text-center sm:pt-20">
        <h1
          className="text-4xl text-neutral-900 sm:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontWeight: 400,
            textWrap: "balance",
            animation: "reveal-up var(--dur-slow) var(--ease-settle) both",
          }}
        >
          Mosa Mian Photography
        </h1>
        {settings.tagline ? (
          <p
            className="mx-auto mt-3 max-w-md text-sm text-neutral-500"
            style={{ animation: "reveal-up var(--dur-slow) var(--ease-settle) 150ms both" }}
          >
            {settings.tagline}
          </p>
        ) : null}
      </div>

      {portfolioSection ? (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <FolderSectionGrid section={portfolioSection} pathSegments={[portfolioFolder!.slug]} depth={0} />
        </div>
      ) : null}
    </PublicShell>
  );
}
