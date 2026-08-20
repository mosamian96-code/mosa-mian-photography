import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comments, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { clientAccessId, assetId, body } = (await req.json()) as {
    clientAccessId?: string;
    assetId?: string;
    body?: string;
  };
  if (!clientAccessId || !assetId || !body?.trim()) {
    return NextResponse.json({ error: "clientAccessId, assetId, and body required" }, { status: 400 });
  }

  const resolved = await resolveLiveClientAccess(clientAccessId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.link.canComment) return NextResponse.json({ error: "commenting disabled" }, { status: 403 });

  const inGallery = await db.query.galleryItems.findFirst({
    where: and(eq(galleryItems.galleryId, resolved.link.galleryId), eq(galleryItems.assetId, assetId)),
  });
  if (!inGallery) return NextResponse.json({ error: "not in this gallery" }, { status: 400 });

  const [comment] = await db
    .insert(comments)
    .values({ clientAccessId, assetId, body: body.trim().slice(0, 2000) })
    .returning();

  return NextResponse.json(comment);
}
