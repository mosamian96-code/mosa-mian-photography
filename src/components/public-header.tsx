import Link from "next/link";
import { SiteSearchBox } from "./site-search-box";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";
import { publicDerivativeUrl } from "@/lib/storage";
import { and, eq } from "drizzle-orm";

/** Site-wide nav (brief section 4 gap-fill: a real homepage/nav, not the Phase 1
 * placeholder). Server-rendered so the profile photo and nav links have no
 * client-side fetch/flash; only the search input itself is interactive. */
export async function PublicHeader() {
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

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4 text-sm">
      <Link href="/" className="flex items-center gap-2 text-neutral-900">
        {profileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : null}
        <span style={{ fontFamily: "var(--font-display)" }}>Mosa Mian</span>
      </Link>

      <nav className="flex items-center gap-4 text-neutral-500">
        <Link href="/" className="hover:text-neutral-900">
          Portfolio
        </Link>
        <Link href="/about" className="hover:text-neutral-900">
          About
        </Link>
        <Link href="/contact" className="hover:text-neutral-900">
          Contact
        </Link>
        <Link href="/keywords" className="hover:text-neutral-900">
          Keywords
        </Link>
        <SiteSearchBox />
      </nav>
    </div>
  );
}
