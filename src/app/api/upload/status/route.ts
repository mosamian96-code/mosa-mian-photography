import { inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by the upload page so it can show real ingest completion (ready/failed)
// instead of sitting at "processing" forever once the upload itself finishes.
export async function GET(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const rows = await db
    .select({ id: assets.id, status: assets.status, errorMessage: assets.errorMessage })
    .from(assets)
    .where(inArray(assets.id, ids));

  return NextResponse.json({ items: rows });
}
