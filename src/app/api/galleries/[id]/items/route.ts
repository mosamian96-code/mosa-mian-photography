import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleryItems } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const { assetIds } = (await req.json()) as { assetIds?: string[] };
  if (!assetIds?.length) return NextResponse.json({ error: "assetIds required" }, { status: 400 });

  const [{ n: startPosition }] = await db
    .select({ n: sql<number>`coalesce(max(${galleryItems.position}), -1) + 1` })
    .from(galleryItems)
    .where(eq(galleryItems.galleryId, galleryId));

  await db
    .insert(galleryItems)
    .values(assetIds.map((assetId, i) => ({ galleryId, assetId, position: startPosition + i })))
    .onConflictDoNothing();

  return NextResponse.json({ ok: true, added: assetIds.length });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  await db
    .delete(galleryItems)
    .where(and(eq(galleryItems.galleryId, galleryId), eq(galleryItems.assetId, assetId)));
  return NextResponse.json({ ok: true });
}
