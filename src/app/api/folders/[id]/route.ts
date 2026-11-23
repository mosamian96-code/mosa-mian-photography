import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { badRequest, nullableString, optionalEnum, optionalInteger, optionalString, withJsonBody } from "@/lib/request-body";
import { FOLDER_VISIBILITIES } from "@/lib/folder-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  return withJsonBody(req, async (body) => {
    // Only these fields can change; anything else in the body is ignored rather than
    // written straight into the row.
    const patch: Partial<typeof folders.$inferInsert> = {};
    const title = optionalString(body, "title", { max: 200 });
    if (title !== undefined) {
      if (!title) return badRequest("title can't be empty");
      patch.title = title;
    }
    const description = nullableString(body, "description", { max: 5000 });
    if (description !== undefined) patch.description = description || null;
    const visibility = optionalEnum(body, "visibility", FOLDER_VISIBILITIES);
    if (visibility !== undefined) patch.visibility = visibility;
    const position = optionalInteger(body, "position");
    if (position !== undefined) patch.position = position;
    if (Object.keys(patch).length === 0) return badRequest("nothing to update");

    const [folder] = await db.update(folders).set(patch).where(eq(folders.id, id)).returning();
    if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(folder);
  });
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
