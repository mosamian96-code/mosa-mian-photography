import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { FOLDER_VISIBILITIES } from "@/lib/folder-visibility";
import { publiclyReachableFolderIds } from "@/lib/public-site/resolve";
import { requireAdminSession } from "@/lib/require-admin";
import { nullableString, optionalEnum, optionalString, requiredString, withJsonBody } from "@/lib/request-body";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;

  const rows = await db.query.folders.findMany({ orderBy: (f, { asc }) => [asc(f.position), asc(f.title)] });
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  return withJsonBody(req, async (body) => {
    const parentId = nullableString(body, "parentId", { max: 100 }) ?? null;
    const title = requiredString(body, "title", { max: 200 });
    const slug = optionalString(body, "slug", { max: 200 });
    const description = optionalString(body, "description", { max: 5000 });
    const visibility = optionalEnum(body, "visibility", FOLDER_VISIBILITIES);

    // Same reasoning as the gallery route's default -- a subfolder created under a
    // non-public-reachable parent (e.g. anything under "Unlisted") has no publish step
    // to catch a stray "public" default the way a gallery does, so it's an even more
    // immediate trap here: it would show up in that parent's listing right away.
    let defaultVisibility: (typeof FOLDER_VISIBILITIES)[number] = "public";
    if (parentId) {
      const reachable = await publiclyReachableFolderIds();
      if (!reachable.has(parentId)) defaultVisibility = "unlisted";
    }

    try {
      const [folder] = await db
        .insert(folders)
        .values({
          parentId,
          title,
          slug: slugify(slug || title),
          description,
          visibility: visibility ?? defaultVisibility,
        })
        .returning();
      return NextResponse.json(folder);
    } catch (err) {
      if (err instanceof Error && err.message.includes("folder_parent_slug_unique")) {
        return NextResponse.json({ error: "a folder with that slug already exists here" }, { status: 409 });
      }
      throw err;
    }
  });
}
