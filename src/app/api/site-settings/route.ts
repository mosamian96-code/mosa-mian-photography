import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { derivatives, siteSettings } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/public-site/site-settings";
import { requireAdminSession } from "@/lib/require-admin";
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

  const body = (await req.json()) as Partial<{
    profileAssetId: string | null;
    heroAssetId: string | null;
    tagline: string;
    aboutBio: string;
    socialInstagram: string;
    socialFacebook: string;
    socialLinkedin: string;
    socialEmail: string;
  }>;

  await getSiteSettings(); // ensure the singleton row exists before updating it
  const [updated] = await db
    .update(siteSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(siteSettings.id, "singleton"))
    .returning();

  return NextResponse.json(updated);
}
