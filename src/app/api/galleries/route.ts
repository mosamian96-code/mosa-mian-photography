import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";
import { publiclyReachableFolderIds } from "@/lib/public-site/resolve";
import { requireAdminSession } from "@/lib/require-admin";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const folderId = req.nextUrl.searchParams.get("folderId");
  const rows = folderId
    ? await db.query.galleries.findMany({
        where: eq(galleries.folderId, folderId),
        orderBy: (g, { asc }) => [asc(g.position), asc(g.title)],
      })
    : await db.query.galleries.findMany({ orderBy: (g, { asc }) => [asc(g.position), asc(g.title)] });
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { folderId, title, slug, description } = (await req.json()) as {
    folderId?: string;
    title?: string;
    slug?: string;
    description?: string;
  };
  if (!folderId || !title) return NextResponse.json({ error: "folderId, title required" }, { status: 400 });

  // A new gallery's own visibility defaults to "public" at the schema level with no
  // awareness of where it's being created -- harmless on its own (nothing shows up
  // without also being explicitly published), but it's a real trap: hit "Publish"
  // without separately checking Visibility and a gallery created under a folder like
  // "Unlisted" goes fully public immediately. Defaulting to "unlisted" here whenever
  // the parent folder isn't itself on a publicly-reachable path removes that trap
  // rather than just documenting around it.
  const reachable = await publiclyReachableFolderIds();
  const defaultVisibility = reachable.has(folderId) ? "public" : "unlisted";

  try {
    const [gallery] = await db
      .insert(galleries)
      .values({ folderId, title, slug: slugify(slug || title), description, visibility: defaultVisibility })
      .returning();
    return NextResponse.json(gallery);
  } catch (err) {
    if (err instanceof Error && err.message.includes("gallery_folder_slug_unique")) {
      return NextResponse.json({ error: "a gallery with that slug already exists here" }, { status: 409 });
    }
    throw err;
  }
}
