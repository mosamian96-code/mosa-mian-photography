import type { Metadata } from "next";
import { GalleryView } from "@/components/gallery-view";
import { PublicShell } from "@/components/public-shell";
import { loadKeywordImages } from "@/lib/public-site/resolve";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ keyword: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  return { title: `${decoded} — Mosa Mian Photography` };
}

export default async function KeywordPage({ params }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  const images = await loadKeywordImages(decoded);

  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
          {decoded}
        </h1>
        <div className="mt-6">
          {images.length > 0 ? (
            <GalleryView images={images} />
          ) : (
            <p className="text-sm text-neutral-400">No published photos tagged with this keyword.</p>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
