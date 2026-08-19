import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const patch = (await req.json()) as Partial<{
    title: string;
    description: string;
    visibility: "public" | "unlisted" | "password" | "private";
    position: number;
  }>;

  const [folder] = await db.update(folders).set(patch).where(eq(folders.id, id)).returning();
  if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(folder);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  // Cascades to subfolders, galleries, and gallery_items — never to the underlying
  // assets, which stay in the library regardless (brief section 4).
  await db.delete(folders).where(eq(folders.id, id));
  return NextResponse.json({ ok: true });
}
