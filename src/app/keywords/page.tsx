import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { listPublicKeywords } from "@/lib/public-site/resolve";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Keywords — Mosa Mian Photography" };

export default async function KeywordsPage() {
  const keywords = await listPublicKeywords();

  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
          Browse by keyword
        </h1>

        {keywords.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
            {keywords.map((k) => (
              <Link
                key={k.value}
                href={`/keywords/${encodeURIComponent(k.value)}`}
                className="text-neutral-600 hover:text-neutral-900"
                style={{ fontSize: `${Math.min(1.5, 0.85 + k.count * 0.03)}rem` }}
              >
                {k.value}
                <span className="ml-1 text-xs text-neutral-400">{k.count}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-neutral-400">No keywords on any published photo yet.</p>
        )}
      </div>
    </PublicShell>
  );
}
