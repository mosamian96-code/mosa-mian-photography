import { FolderSectionGrid } from "@/components/folder-section-grid";
import { PublicShell } from "@/components/public-shell";
import { listRootFolders, resolvePath } from "@/lib/public-site/resolve";
import { getSiteSettings } from "@/lib/public-site/site-settings";

// Reads live site settings (tagline, hero photo) on every request -- without this,
// Next would statically prerender the homepage at build time and bake in whatever
// settings existed then, same class of bug already hit once with the Turnstile key on
// /contact.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, rootFolders] = await Promise.all([getSiteSettings(), listRootFolders()]);

  // The homepage embeds the portfolio root folder's own grid directly rather than
  // leaving `/` as a bare hero with nothing below it -- "portfolio" is whichever
  // public root folder sorts first, same folder the top nav links to.
  const portfolioFolder = rootFolders[0];
  const portfolioResolved = portfolioFolder ? await resolvePath([portfolioFolder.slug]) : null;
  const portfolioSection = portfolioResolved?.type === "folder" ? portfolioResolved.section : null;

  return (
    <PublicShell>

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
