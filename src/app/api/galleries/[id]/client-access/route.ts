import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess, comments, favorites } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const links = await db.query.clientAccess.findMany({
    where: eq(clientAccess.galleryId, galleryId),
    orderBy: [desc(clientAccess.createdAt)],
  });

  const withCounts = await Promise.all(
    links.map(async (link) => {
      const [favCount, commentRows] = await Promise.all([
        db.$count(favorites, eq(favorites.clientAccessId, link.id)),
        db.query.comments.findMany({ where: eq(comments.clientAccessId, link.id) }),
      ]);
      return {
        ...link,
        passwordHash: undefined,
        favoriteCount: favCount,
        commentCount: commentRows.length,
        unreadCommentCount: commentRows.filter((c) => !c.readAt).length,
      };
    }),
  );

  return NextResponse.json({ items: withCounts });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const body = (await req.json()) as {
    email?: string;
    password?: string;
    expiresAt?: string;
    downloadsEnabled?: boolean;
    canFavorite?: boolean;
    canComment?: boolean;
  };

  const [link] = await db
    .insert(clientAccess)
    .values({
      galleryId,
      email: body.email || null,
      passwordHash: body.password ? hashPassword(body.password) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      downloadsEnabled: body.downloadsEnabled ?? true,
      canFavorite: body.canFavorite ?? true,
      canComment: body.canComment ?? true,
    })
    .returning();

  return NextResponse.json({ ...link, passwordHash: undefined });
}
