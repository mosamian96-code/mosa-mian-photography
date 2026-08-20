import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { watermarks } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { publicDerivativeUrl, putObject, watermarkMarkKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;

  const items = await db.query.watermarks.findMany({ orderBy: [desc(watermarks.createdAt)] });
  return NextResponse.json({
    items: items.map((w) => ({ ...w, previewUrl: publicDerivativeUrl(w.storageKey) })),
  });
}

// Small, one-off image (a logo mark, typically a few KB-100KB) — uploaded directly
// through the app server rather than presigned, unlike originals (section 6/7).
export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const form = await req.formData();
  const file = form.get("file");
  const name = form.get("name");
  const position = form.get("position");
  const opacityRaw = form.get("opacity");

  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.type !== "image/png") {
    return NextResponse.json({ error: "watermark must be a PNG (for transparency)" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const validPositions = [
    "bottom_right",
    "bottom_left",
    "top_right",
    "top_left",
    "center",
    "tile",
  ] as const;
  const resolvedPosition =
    typeof position === "string" && (validPositions as readonly string[]).includes(position)
      ? (position as (typeof validPositions)[number])
      : "bottom_right";
  const opacity = typeof opacityRaw === "string" && opacityRaw ? Number(opacityRaw) : 0.5;

  const id = crypto.randomUUID();
  const key = watermarkMarkKey(id);
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject(key, buffer, "image/png");

  const [row] = await db
    .insert(watermarks)
    .values({
      id,
      name: name.trim(),
      storageKey: key,
      position: resolvedPosition,
      opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.5,
    })
    .returning();

  return NextResponse.json({ ...row, previewUrl: publicDerivativeUrl(key) });
}
