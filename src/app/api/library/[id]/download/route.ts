import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { presignDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin download of an original -- unlike the public download routes, this isn't
 * gated by any gallery's downloadsPolicy, since the admin owns every photo in the
 * library regardless of which (if any) gallery it's published through. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, id), isNull(assets.deletedAt)) });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = await presignDownloadUrl(asset.storageKey, asset.originalFilename);
  return NextResponse.redirect(url);
}
