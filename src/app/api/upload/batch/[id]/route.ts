import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const batch = await db.query.importBatches.findFirst({ where: eq(importBatches.id, id) });
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(batch);
}
