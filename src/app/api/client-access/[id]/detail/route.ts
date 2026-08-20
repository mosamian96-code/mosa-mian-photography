import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comments, favorites } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { publicDerivativeUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: clientAccessId } = await params;

  const [favoriteRows, commentRows] = await Promise.all([
    db.query.favorites.findMany({ where: eq(favorites.clientAccessId, clientAccessId) }),
    db.query.comments.findMany({ where: eq(comments.clientAccessId, clientAccessId), orderBy: (c, { asc }) => [asc(c.createdAt)] }),
  ]);

  const assetIds = [...new Set([...favoriteRows.map((f) => f.assetId), ...commentRows.map((c) => c.assetId)])];
  const [assetRows, thumbRows] = await Promise.all([
    assetIds.length
      ? db.query.assets.findMany({ where: (a, { inArray }) => inArray(a.id, assetIds) })
      : Promise.resolve([]),
    assetIds.length
      ? db.query.derivatives.findMany({
          where: (d, { inArray }) => and(inArray(d.assetId, assetIds), eq(d.variant, "400"), eq(d.format, "webp")),
        })
      : Promise.resolve([]),
  ]);
  const filenameByAsset = new Map(assetRows.map((a) => [a.id, a.originalFilename]));
  const thumbByAsset = new Map(thumbRows.map((d) => [d.assetId, publicDerivativeUrl(d.storageKey)]));

  // Viewing the inbox marks unread comments read (brief: "an inbox of new comments").
  await db
    .update(comments)
    .set({ readAt: new Date() })
    .where(and(eq(comments.clientAccessId, clientAccessId), isNull(comments.readAt)));

  return NextResponse.json({
    favorites: favoriteRows.map((f) => ({
      assetId: f.assetId,
      filename: filenameByAsset.get(f.assetId) ?? "",
      thumbUrl: thumbByAsset.get(f.assetId) ?? null,
    })),
    comments: commentRows.map((c) => ({
      id: c.id,
      assetId: c.assetId,
      filename: filenameByAsset.get(c.assetId) ?? "",
      thumbUrl: thumbByAsset.get(c.assetId) ?? null,
      body: c.body,
      createdAt: c.createdAt,
    })),
  });
}
