import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { totalFiles } = (await req.json()) as { totalFiles?: number };
  const [batch] = await db
    .insert(importBatches)
    .values({ totalFiles: totalFiles ?? 0 })
    .returning({ id: importBatches.id });

  return NextResponse.json({ batchId: batch.id });
}
