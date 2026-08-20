import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { searchPublicContent } from "@/lib/public-site/resolve";

type Props = { searchParams: Promise<{ q?: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search — Mosa Mian Photography", robots: { index: false } };

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchPublicContent(query) : { folders: [], galleries: [], keywords: [] };
  const hasResults = results.folders.length + results.galleries.length + results.keywords.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PublicHeader />
      <h1 className="text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
        {query ? `Results for "${query}"` : "Search"}
      </h1>

      {query && !hasResults ? <p className="mt-6 text-sm text-neutral-400">Nothing found.</p> : null}

      {results.galleries.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-neutral-500">Galleries</h2>
          <ul className="mt-2 space-y-1">
            {results.galleries.map((g) => (
              <li key={g.id}>
                <Link href={`${g.folderPath}/${g.slug}`} className="text-neutral-800 hover:text-neutral-900 hover:underline">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.folders.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-neutral-500">Folders</h2>
          <ul className="mt-2 space-y-1">
            {results.folders.map((f) => (
              <li key={f.id}>
                <Link href={`/${f.slug}`} className="text-neutral-800 hover:text-neutral-900 hover:underline">
                  {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.keywords.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-neutral-500">Keywords</h2>
          <ul className="mt-2 space-y-1">
            {results.keywords.map((k) => (
              <li key={k.value}>
                <Link href={`/keywords/${encodeURIComponent(k.value)}`} className="text-neutral-800 hover:text-neutral-900 hover:underline">
                  {k.value} <span className="text-xs text-neutral-400">({k.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
