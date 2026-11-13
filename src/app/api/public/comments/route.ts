import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { recordClientActivity } from "@/lib/client-activity";
import { db } from "@/lib/db";
import { comments, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMMENT_LENGTH = 2000;

/** Adds a client's comment on one photo. */
export const POST = withErrorLogging("public-comments", async (req: NextRequest) => {
  const json: unknown = await req.json().catch(() => null);
  const { clientAccessId, assetId, body } = (json ?? {}) as Record<string, unknown>;
  if (
    typeof clientAccessId !== "string" ||
    typeof assetId !== "string" ||
    typeof body !== "string" ||
    !clientAccessId ||
    !assetId ||
    !body.trim()
  ) {
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
    .values({ clientAccessId, assetId, body: body.trim().slice(0, MAX_COMMENT_LENGTH) })
    .returning();
  await recordClientActivity(resolved.link, { kind: "comment", assetId });

  return NextResponse.json(comment);
});
