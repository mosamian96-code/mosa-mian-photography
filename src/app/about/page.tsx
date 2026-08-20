import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { PublicHeader } from "@/components/public-header";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { publicDerivativeUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About — Mosa Mian Photography" };

export default async function AboutPage() {
  const settings = await getSiteSettings();

  const profileThumb = settings.profileAssetId
    ? await db.query.derivatives.findFirst({
        where: and(eq(derivatives.assetId, settings.profileAssetId), eq(derivatives.variant, "1200"), eq(derivatives.format, "webp")),
      })
    : null;
  const profileUrl = profileThumb ? publicDerivativeUrl(profileThumb.storageKey) : null;

  const socials = [
    settings.socialInstagram ? { label: "Instagram", href: settings.socialInstagram } : null,
    settings.socialFacebook ? { label: "Facebook", href: settings.socialFacebook } : null,
    settings.socialEmail ? { label: "Email", href: `mailto:${settings.socialEmail}` } : null,
  ].filter((s): s is { label: string; href: string } => s !== null);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PublicHeader />

      <div className="flex flex-col items-center text-center">
        {profileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileUrl} alt="Mosa Mian" className="h-32 w-32 rounded-full object-cover" />
        ) : null}
        <h1 className="mt-4 text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
          About
        </h1>
        {settings.aboutBio ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{settings.aboutBio}</p>
        ) : (
          <p className="mt-4 text-sm text-neutral-400">Bio coming soon.</p>
        )}

        {socials.length > 0 ? (
          <div className="mt-6 flex gap-4 text-sm text-neutral-500">
            {socials.map((s) => (
              <a key={s.label} href={s.href} target={s.label === "Email" ? undefined : "_blank"} rel="noopener noreferrer" className="hover:text-neutral-900">
                {s.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
