import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess, clientActivity, comments, favorites, galleries } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { requireAdminSession } from "@/lib/require-admin";
import { badRequest, optionalBoolean, optionalString, withJsonBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  const [links, activityRows] = await Promise.all([
    db.query.clientAccess.findMany({
      where: eq(clientAccess.galleryId, galleryId),
      orderBy: [desc(clientAccess.createdAt)],
    }),
    db
      .select({
        clientAccessId: clientActivity.clientAccessId,
        lastViewedAt: sql<Date | null>`max(${clientActivity.createdAt}) filter (where ${clientActivity.kind} = 'view')`.mapWith(
          clientActivity.createdAt,
        ),
        viewCount: sql<number>`count(*) filter (where ${clientActivity.kind} = 'view')`.mapWith(Number),
        downloadCount: sql<number>`count(*) filter (where ${clientActivity.kind} in ('download', 'download_all', 'download_favorites'))`.mapWith(
          Number,
        ),
      })
      .from(clientActivity)
      .where(eq(clientActivity.galleryId, galleryId))
      .groupBy(clientActivity.clientAccessId),
  ]);
  const activityByLink = new Map(activityRows.map((a) => [a.clientAccessId, a]));

  const withCounts = await Promise.all(
    links.map(async (link) => {
      const [favCount, commentRows] = await Promise.all([
        db.$count(favorites, eq(favorites.clientAccessId, link.id)),
        db.query.comments.findMany({ where: eq(comments.clientAccessId, link.id) }),
      ]);
      const activity = activityByLink.get(link.id);
      return {
        ...link,
        passwordHash: undefined,
        favoriteCount: favCount,
        commentCount: commentRows.length,
        unreadCommentCount: commentRows.filter((c) => !c.readAt).length,
        lastViewedAt: activity?.lastViewedAt ?? null,
        viewCount: activity?.viewCount ?? 0,
        downloadCount: activity?.downloadCount ?? 0,
      };
    }),
  );

  return NextResponse.json({ items: withCounts });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id: galleryId } = await params;
  return withJsonBody(req, async (body) => {
    const email = optionalString(body, "email", { max: 254 });
    const password = optionalString(body, "password", { max: 200, trim: false });
    const expiresOn = optionalString(body, "expiresAt", { max: 10 });
    // Same meaning as the link editor (client-access/[id]): a date means "through the
    // end of that day, UTC". This used to read it as the start of the day, a day early.
    let expiresAt: Date | null = null;
    if (expiresOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn))) {
        return badRequest("expiresAt must be a date (YYYY-MM-DD)");
      }
      expiresAt = new Date(`${expiresOn}T23:59:59.999Z`);
    }

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId), columns: { id: true } });
    if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [link] = await db
      .insert(clientAccess)
      .values({
        galleryId,
        email: email || null,
        passwordHash: password ? await hashPassword(password) : null,
        expiresAt,
        downloadsEnabled: optionalBoolean(body, "downloadsEnabled") ?? true,
        canFavorite: optionalBoolean(body, "canFavorite") ?? true,
        canComment: optionalBoolean(body, "canComment") ?? true,
      })
      .returning();

    return NextResponse.json({ ...link, passwordHash: undefined });
  });
}
