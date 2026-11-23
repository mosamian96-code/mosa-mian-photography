import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { derivatives, siteSettings } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { requireAdminSession } from "@/lib/require-admin";
import { badRequest, nullableString, withJsonBody } from "@/lib/request-body";
import { publicDerivativeUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;

  const settings = await getSiteSettings();
  const ids = [settings.profileAssetId, settings.heroAssetId].filter((id): id is string => Boolean(id));
  const thumbs = ids.length
    ? await db.query.derivatives.findMany({
        where: and(inArray(derivatives.assetId, ids), eq(derivatives.variant, "400"), eq(derivatives.format, "webp")),
      })
    : [];
  const urlByAsset = new Map(thumbs.map((t) => [t.assetId, publicDerivativeUrl(t.storageKey)]));

  return NextResponse.json({
    ...settings,
    profileUrl: settings.profileAssetId ? (urlByAsset.get(settings.profileAssetId) ?? null) : null,
    heroUrl: settings.heroAssetId ? (urlByAsset.get(settings.heroAssetId) ?? null) : null,
  });
}

export async function PATCH(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  return withJsonBody(req, async (body) => {
    const patch: Partial<typeof siteSettings.$inferInsert> = {};
    for (const key of ["profileAssetId", "heroAssetId"] as const) {
      const value = nullableString(body, key, { max: 100 });
      if (value !== undefined) patch[key] = value || null;
    }
    const tagline = nullableString(body, "tagline", { max: 300 });
    if (tagline !== undefined) patch.tagline = tagline || null;
    const aboutBio = nullableString(body, "aboutBio", { max: 10000 });
    if (aboutBio !== undefined) patch.aboutBio = aboutBio || null;
    for (const key of ["socialInstagram", "socialFacebook", "socialLinkedin"] as const) {
      const value = nullableString(body, key, { max: 500 });
      if (value === undefined) continue;
      // These render as links on every public page, so only web addresses are kept
      // (a "javascript:" value would otherwise become a clickable script link).
      if (value && !/^https?:\/\//i.test(value)) return badRequest(`${key} must start with https://`);
      patch[key] = value || null;
    }
    const socialEmail = nullableString(body, "socialEmail", { max: 254 });
    if (socialEmail !== undefined) patch.socialEmail = socialEmail || null;

    await getSiteSettings(); // ensure the singleton row exists before updating it
    try {
      const [updated] = await db
        .update(siteSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(siteSettings.id, "singleton"))
        .returning();
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message.includes("foreign key")) return badRequest("that photo doesn't exist");
      throw err;
    }
  });
}
