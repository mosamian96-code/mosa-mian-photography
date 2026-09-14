import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { ContactForm } from "@/components/contact-form";
import { PublicShell } from "@/components/public-shell";
import { RevealOnView } from "@/components/reveal-on-view";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { publicDerivativeUrl } from "@/lib/storage";

// Reads TURNSTILE_SITE_KEY from the environment on every request rather than baking
// it into a statically prerendered page at build time -- without this, filling in the
// key later and restarting the container wouldn't be enough; only a rebuild would pick
// it up, since the static HTML was already generated with whatever value (or lack of
// one) existed when `npm run build` ran.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contact — Mosa Mian Photography" };

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const profileThumb = settings.profileAssetId
    ? await db.query.derivatives.findFirst({
        where: and(eq(derivatives.assetId, settings.profileAssetId), eq(derivatives.variant, "1200"), eq(derivatives.format, "webp")),
      })
    : null;
  const profileUrl = profileThumb ? publicDerivativeUrl(profileThumb.storageKey) : null;

  return (
    <PublicShell>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <RevealOnView className="order-2 lg:order-1">
          <div className="relative overflow-hidden rounded bg-neutral-100" style={{ aspectRatio: "4/5" }}>
            {profileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileUrl} alt="Mosa Mian" className="h-full w-full object-cover" />
            ) : null}
          </div>
        </RevealOnView>

        <div className="order-1 lg:order-2">
          <RevealOnView>
            <h1
              className="text-3xl text-neutral-900 sm:text-4xl"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, textWrap: "balance" }}
            >
              Get in touch
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500">
              {settings.tagline || "Tell me a bit about what you have in mind, and I'll get back to you shortly."}
            </p>
          </RevealOnView>

          <RevealOnView delayMs={120}>
            <div className="mt-8 rounded border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
              <ContactForm turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} />
            </div>
          </RevealOnView>

          {settings.socialEmail ? (
            <RevealOnView delayMs={200}>
              <p className="mt-6 text-sm text-neutral-400">
                Prefer email?{" "}
                <a href={`mailto:${settings.socialEmail}`} className="nav-link text-neutral-600 hover:text-neutral-900">
                  {settings.socialEmail}
                </a>
              </p>
            </RevealOnView>
          ) : null}
        </div>
      </div>
    </PublicShell>
  );
}
