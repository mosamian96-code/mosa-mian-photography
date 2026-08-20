import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";
import { listRootFolders } from "@/lib/public-site/resolve";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { publicDerivativeUrl } from "@/lib/storage";

// Reads live site settings (profile/hero photo, tagline) on every request -- without
// this, Next would statically prerender the homepage at build time and bake in
// whatever settings existed then, same class of bug already hit once with the
// Turnstile key on /contact.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, folders] = await Promise.all([getSiteSettings(), listRootFolders()]);

  const heroThumb = settings.heroAssetId
    ? await db.query.derivatives.findFirst({
        where: and(eq(derivatives.assetId, settings.heroAssetId), eq(derivatives.variant, "2560"), eq(derivatives.format, "webp")),
      })
    : null;
  const heroUrl = heroThumb ? publicDerivativeUrl(heroThumb.storageKey) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <PublicHeader />

      {heroUrl ? (
        <div className="relative -mx-4 flex h-[70vh] min-h-[420px] items-end overflow-hidden bg-neutral-900 sm:mx-0 sm:rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="relative px-6 py-10 text-white sm:px-10">
            <h1
              className="text-3xl sm:text-5xl"
              style={{ fontFamily: "var(--font-display)", fontWeight: 300, textWrap: "balance" }}
            >
              Mosa Mian Photography
            </h1>
            {settings.tagline ? <p className="mt-2 max-w-md text-sm text-white/80 sm:text-base">{settings.tagline}</p> : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-xl font-medium text-neutral-900">Mosa Mian Photography</h1>
          {settings.tagline ? <p className="mt-2 max-w-sm text-sm text-neutral-500">{settings.tagline}</p> : null}
        </div>
      )}

      <section className="mt-10">
        {folders.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {folders.map((f) => (
              <Link key={f.id} href={`/${f.slug}`} className="group">
                <div className="flex aspect-square items-center justify-center rounded bg-neutral-100 text-sm text-neutral-400 transition-colors group-hover:bg-neutral-200">
                  {f.title}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-neutral-400">Nothing published yet.</p>
        )}
      </section>

      <div className="mt-10 text-center">
        <Link href="/contact" className="text-sm text-neutral-600 underline hover:text-neutral-900">
          Get in touch
        </Link>
      </div>
    </main>
  );
}
