import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryPasswordForm } from "@/components/gallery-password-form";
import { GalleryView } from "@/components/gallery-view";
import { gallerySessionCookieName, verifyGalleryToken } from "@/lib/public-site/gallery-auth";
import { loadGalleryImages, resolvePath } from "@/lib/public-site/resolve";

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const resolved = await resolvePath(path);
  if (!resolved) return {};

  if (resolved.type === "gallery") {
    return {
      title: `${resolved.gallery.title} — Mosa Mian Photography`,
      description: resolved.gallery.description ?? `Photos from ${resolved.gallery.title} — Mosa Mian Photography.`,
      robots: resolved.gallery.visibility === "public" ? undefined : { index: false },
    };
  }
  return {
    title: `${resolved.folder.title} — Mosa Mian Photography`,
    description: resolved.folder.description ?? `${resolved.folder.title} — Mosa Mian Photography.`,
    robots: resolved.folder.visibility === "public" ? undefined : { index: false },
  };
}

function Breadcrumb({ trail }: { trail: { title: string; href: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500">
      <Link href="/" className="hover:text-neutral-900">
        Home
      </Link>
      {trail.map((t) => (
        <span key={t.href} className="flex items-center gap-1">
          <span>/</span>
          <Link href={t.href} className="hover:text-neutral-900">
            {t.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export default async function PublicPathPage({ params }: Props) {
  const { path } = await params;
  const resolved = await resolvePath(path);
  if (!resolved) notFound();

  const trail = resolved.breadcrumb.map((f, i) => ({
    title: f.title,
    href: "/" + resolved.breadcrumb.slice(0, i + 1).map((b) => b.slug).join("/"),
  }));

  if (resolved.type === "gallery") {
    const { gallery } = resolved;

    if (gallery.visibility === "password") {
      const cookieStore = await cookies();
      const token = cookieStore.get(gallerySessionCookieName(gallery.id))?.value;
      if (!verifyGalleryToken(gallery.id, token)) {
        return <GalleryPasswordForm galleryId={gallery.id} />;
      }
    }

    const images = await loadGalleryImages(gallery);

    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Breadcrumb trail={trail} />
        <h1
          className="mt-4 text-2xl text-neutral-900"
          style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
        >
          {gallery.title}
        </h1>
        {gallery.description ? <p className="mt-2 max-w-2xl text-sm text-neutral-500">{gallery.description}</p> : null}
        <div className="mt-6">
          {images.length > 0 ? (
            <GalleryView images={images} />
          ) : (
            <p className="text-sm text-neutral-400">This gallery is empty.</p>
          )}
        </div>
      </main>
    );
  }

  const { folder, subfolders, galleries } = resolved;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb trail={trail} />
      <h1 className="mt-4 text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
        {folder.title}
      </h1>
      {folder.description ? <p className="mt-2 max-w-2xl text-sm text-neutral-500">{folder.description}</p> : null}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {subfolders.map((f) => (
          <Link key={f.id} href={`/${[...path, f.slug].join("/")}`} className="group">
            <div className="flex aspect-square items-center justify-center rounded bg-neutral-100 text-sm text-neutral-400 transition-colors group-hover:bg-neutral-200">
              {f.title}
            </div>
          </Link>
        ))}
        {galleries.map((g) => (
          <Link key={g.id} href={`/${[...path, g.slug].join("/")}`} className="group">
            <div className="aspect-square overflow-hidden rounded bg-neutral-100">
              {g.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.coverUrl}
                  alt={g.title}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                />
              ) : null}
            </div>
            <p className="mt-2 truncate text-sm text-neutral-800">{g.title}</p>
            <p className="text-xs text-neutral-400">{g.photoCount} photos</p>
          </Link>
        ))}
        {subfolders.length === 0 && galleries.length === 0 ? (
          <p className="col-span-full text-sm text-neutral-400">Nothing published here yet.</p>
        ) : null}
      </div>
    </main>
  );
}
