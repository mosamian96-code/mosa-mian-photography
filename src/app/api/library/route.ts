import { and, count, desc, eq, isNull, like, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assetMetadata, assets, derivatives } from "@/lib/db/schema";
import { presignGetUrl } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export async function GET(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { searchParams } = req.nextUrl;
  const offset = Number(searchParams.get("offset") ?? 0);
  const camera = searchParams.get("camera");
  const kind = searchParams.get("kind");

  const conditions = [
    eq(assets.status, "ready"),
    isNull(assets.deletedAt),
    or(isNull(assets.groupId), eq(assets.isGroupPrimary, true)),
  ];
  if (camera) conditions.push(like(assetMetadata.camera, `%${camera}%`));
  if (kind) conditions.push(eq(assets.kind, kind as "raw" | "jpeg" | "heic" | "sidecar"));

  const rows = await db
    .select({
      id: assets.id,
      filename: assets.originalFilename,
      kind: assets.kind,
      capturedAt: assets.capturedAt,
      importedAt: assets.importedAt,
      lqip: assets.lqip,
      width: assets.width,
      height: assets.height,
      camera: assetMetadata.camera,
      thumbKey: derivatives.storageKey,
    })
    .from(assets)
    .leftJoin(assetMetadata, eq(assetMetadata.assetId, assets.id))
    .leftJoin(
      derivatives,
      and(eq(derivatives.assetId, assets.id), eq(derivatives.variant, "400"), eq(derivatives.format, "webp")),
    )
    .where(and(...conditions))
    .orderBy(desc(assets.capturedAt), desc(assets.importedAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const items = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbUrl: row.thumbKey ? await presignGetUrl(row.thumbKey, 3600) : null,
      thumbKey: undefined,
    })),
  );

  const statusCounts = await db
    .select({ status: assets.status, n: count() })
    .from(assets)
    .where(and(isNull(assets.deletedAt), or(isNull(assets.groupId), eq(assets.isGroupPrimary, true))))
    .groupBy(assets.status);

  return NextResponse.json({
    items,
    nextOffset: rows.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
    counts: Object.fromEntries(statusCounts.map((c) => [c.status, c.n])),
  });
}
