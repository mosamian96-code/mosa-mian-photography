import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { CursorRing } from "./cursor-ring";
import { ScrollProgress } from "./scroll-progress";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { publicDerivativeUrl } from "@/lib/storage";

// Curated shortlist, not derived from the folder tree -- "every category" already
// lives in the homepage's own grid, this is just the three asked for directly. The
// Events folder's slug ("events-1") doesn't match its display title (renamed for
// display without renaming the URL).
const QUICK_LINKS = [
  { label: "Weddings", href: "/public-gallery/weddings" },
  { label: "Events", href: "/public-gallery/events-1" },
  { label: "Travel", href: "/public-gallery/travel" },
];

/** Dark top bar (logo, quick links, contact, socials) spanning every public page,
 * with a native <details>/<summary> dropdown for the mobile menu -- no client JS
 * needed for the collapse, matching the project's preference for the platform
 * primitive over a hand-rolled toggle (same reasoning as native drag-and-drop
 * elsewhere in the app). */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const profileThumb = settings.profileAssetId
    ? await db.query.derivatives.findFirst({
        where: and(
          eq(derivatives.assetId, settings.profileAssetId),
          eq(derivatives.variant, "400"),
          eq(derivatives.format, "webp"),
        ),
      })
    : null;
  const profileUrl = profileThumb ? publicDerivativeUrl(profileThumb.storageKey) : null;

  const socials = [
    settings.socialInstagram ? { label: "Instagram", href: settings.socialInstagram, icon: InstagramIcon } : null,
    settings.socialFacebook ? { label: "Facebook", href: settings.socialFacebook, icon: FacebookIcon } : null,
    settings.socialLinkedin ? { label: "LinkedIn", href: settings.socialLinkedin, icon: LinkedInIcon } : null,
    settings.socialEmail ? { label: "Email", href: `mailto:${settings.socialEmail}`, icon: EmailIcon } : null,
  ].filter((s): s is { label: string; href: string; icon: typeof InstagramIcon } => s !== null);

  return (
    <div className="min-h-screen">
      <CursorRing />
      <ScrollProgress />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            {profileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-[10px] text-white/30">
                MM
              </span>
            )}
            <span
              className="text-base text-white"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
            >
              Mosa Mian
            </span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {QUICK_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link text-sm tracking-wide text-white/60 transition-colors hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            <Link href="/contact" className="nav-link text-sm tracking-wide text-white/60 transition-colors hover:text-white">
              Contact
            </Link>
            {socials.length > 0 ? <span className="h-4 w-px bg-white/15" aria-hidden="true" /> : null}
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target={s.label === "Email" ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label={s.label}
                title={s.label}
                className="text-white/50 transition-all duration-300 ease-out hover:scale-110 hover:text-white"
              >
                <s.icon />
              </a>
            ))}
          </div>

          <details className="relative lg:hidden">
            <summary
              aria-label="Menu"
              className="flex cursor-pointer list-none items-center justify-center p-2 text-white/70 hover:text-white [&::-webkit-details-marker]:hidden"
            >
              <MenuIcon />
            </summary>
            <div className="absolute right-0 top-full mt-2 w-56 rounded border border-white/10 bg-neutral-950 p-4 shadow-xl">
              <nav className="flex flex-col gap-3 text-sm text-white/70">
                {QUICK_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">
                <Link href="/contact" className="text-sm text-white/70 transition-colors hover:text-white">
                  Contact
                </Link>
                {socials.length > 0 ? (
                  <>
                    <span className="h-4 w-px bg-white/15" aria-hidden="true" />
                    {socials.map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target={s.label === "Email" ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        aria-label={s.label}
                        title={s.label}
                        className="text-white/50 transition-all duration-300 ease-out hover:scale-110 hover:text-white"
                      >
                        <s.icon />
                      </a>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          </details>
        </div>
      </header>

      <main className="min-w-0">{children}</main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 8.5h2.5V5.2h-2.7C11.4 5.2 10 6.8 10 9.2v2.1H8v3.3h2V21h3.4v-6.4h2.5l.4-3.3h-2.9V9.4c0-.7.2-.9 1-.9Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.94 8.5H4V20h2.94V8.5ZM5.47 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM20 13.3c0-3-1.6-4.4-3.8-4.4a3.3 3.3 0 0 0-3 1.6V8.5H10.3c.04.9 0 11.5 0 11.5h2.94v-6.4c0-.34.02-.68.12-.93.27-.68.9-1.4 1.94-1.4 1.37 0 1.92 1.05 1.92 2.58V20H20v-6.7Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 6.5 8 6.5 8-6.5" />
    </svg>
  );
}
