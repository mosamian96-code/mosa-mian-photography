import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const folderId = req.nextUrl.searchParams.get("folderId");
  const rows = folderId
    ? await db.query.galleries.findMany({ where: eq(galleries.folderId, folderId) })
    : await db.query.galleries.findMany();
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

  try {
    const [gallery] = await db
      .insert(galleries)
      .values({ folderId, title, slug: slugify(slug || title), description })
      .returning();
    return NextResponse.json(gallery);
  } catch (err) {
    if (err instanceof Error && err.message.includes("gallery_folder_slug_unique")) {
      return NextResponse.json({ error: "a gallery with that slug already exists here" }, { status: 409 });
    }
    throw err;
  }
}
