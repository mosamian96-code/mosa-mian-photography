import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { favorites, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { clientAccessId, assetId } = (await req.json()) as { clientAccessId?: string; assetId?: string };
  if (!clientAccessId || !assetId) {
    return NextResponse.json({ error: "clientAccessId and assetId required" }, { status: 400 });
  }

  const resolved = await resolveLiveClientAccess(clientAccessId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.link.canFavorite) return NextResponse.json({ error: "favoriting disabled" }, { status: 403 });

  const inGallery = await db.query.galleryItems.findFirst({
    where: and(eq(galleryItems.galleryId, resolved.link.galleryId), eq(galleryItems.assetId, assetId)),
  });
  if (!inGallery) return NextResponse.json({ error: "not in this gallery" }, { status: 400 });

  const existing = await db.query.favorites.findFirst({
    where: and(eq(favorites.clientAccessId, clientAccessId), eq(favorites.assetId, assetId)),
  });

  if (existing) {
    await db.delete(favorites).where(eq(favorites.id, existing.id));
    return NextResponse.json({ favorited: false });
  }
  await db.insert(favorites).values({ clientAccessId, assetId });
  return NextResponse.json({ favorited: true });
}
