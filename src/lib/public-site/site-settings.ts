import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";

const SINGLETON_ID = "singleton";

/** Get-or-create the one site_settings row. Never throws on "not found" -- a fresh
 * install has no row yet, and every field is meant to have a sensible empty default. */
export async function getSiteSettings() {
  const existing = await db.query.siteSettings.findFirst({ where: eq(siteSettings.id, SINGLETON_ID) });
  if (existing) return existing;

  const [created] = await db
    .insert(siteSettings)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.siteSettings.findFirst({ where: eq(siteSettings.id, SINGLETON_ID) }))!;
}
