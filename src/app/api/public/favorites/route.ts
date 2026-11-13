import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { recordClientActivity } from "@/lib/client-activity";
import { db } from "@/lib/db";
import { favorites, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggles one photo in a client's favorites. */
export const POST = withErrorLogging("public-favorites", async (req: NextRequest) => {
  const body: unknown = await req.json().catch(() => null);
  const { clientAccessId, assetId } = (body ?? {}) as Record<string, unknown>;
  if (typeof clientAccessId !== "string" || typeof assetId !== "string" || !clientAccessId || !assetId) {
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
    await recordClientActivity(resolved.link, { kind: "unfavorite", assetId });
    return NextResponse.json({ favorited: false });
  }
  // A double click can race two inserts; the unique constraint keeps one.
  await db.insert(favorites).values({ clientAccessId, assetId }).onConflictDoNothing();
  await recordClientActivity(resolved.link, { kind: "favorite", assetId });
  return NextResponse.json({ favorited: true });
});
