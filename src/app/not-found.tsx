import Link from "next/link";

/** Next.js renders this for any route that doesn't match a page (brief: polished
 * states for every outcome, not the framework's default blank "404" text). Deliberately
 * not wrapped in PublicShell -- that component fetches site settings from the DB, and
 * a 404 should render even if the DB is unreachable. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">404</p>
      <h1
        className="mt-3 text-3xl text-neutral-900 sm:text-4xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, textWrap: "balance" }}
      >
        This page doesn&apos;t exist
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500">
        The link may be broken, or the gallery may have moved. Let&apos;s get you back to somewhere real.
      </p>
      <Link
        href="/"
        className="mt-8 rounded bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        Back to the homepage
      </Link>
    </main>
  );
}
