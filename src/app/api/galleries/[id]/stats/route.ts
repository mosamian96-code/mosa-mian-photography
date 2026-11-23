import { NextRequest, NextResponse } from "next/server";
import { loadGalleryStats } from "@/lib/gallery-stats";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The last 30 days of views and downloads for the studio's gallery editor. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  return NextResponse.json(await loadGalleryStats(id, 30));
}
