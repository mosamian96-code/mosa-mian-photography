import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { folders, galleries, redirects } from "@/lib/db/schema";
import { buildFolderPaths } from "@/lib/public-site/folder-paths";
import { slugify } from "@/lib/slug";

export type RenameResult = { ok: true; slug: string } | { ok: false; status: number; error: string };

/**
 * Changes a gallery's web address and keeps the old one working: a redirect row sends
 * the old path to the new one (the public page answers it with a 308), so links that
 * were already shared, and search engines' copies, follow the gallery.
 *
 * Existing redirects that pointed at the old path are moved to the new one, so a
 * gallery renamed twice never makes a visitor follow two hops. A redirect *from* the
 * new path is deleted, because that address is now a real page again (renaming back).
 */
export async function renameGallerySlug(galleryId: string, requested: string): Promise<RenameResult> {
  if (!requested.trim()) return { ok: false, status: 400, error: "The web address can't be empty." };
  // Typed text becomes a valid slug the same way new galleries get theirs ("Öland" -> "oland").
  const slug = slugify(requested);

  const gallery = await db.query.galleries.findFirst({
    where: eq(galleries.id, galleryId),
    columns: { id: true, folderId: true, slug: true },
  });
  if (!gallery) return { ok: false, status: 404, error: "not found" };
  if (gallery.slug === slug) return { ok: true, slug };

  const folderRows = await db.select({ id: folders.id, parentId: folders.parentId, slug: folders.slug }).from(folders);
  const folderPath = buildFolderPaths(folderRows).get(gallery.folderId);

  try {
    await db.transaction(async (tx) => {
      await tx.update(galleries).set({ slug }).where(eq(galleries.id, galleryId));
      if (!folderPath) return;
      const oldPath = `${folderPath}/${gallery.slug}`;
      const newPath = `${folderPath}/${slug}`;
      await tx.update(redirects).set({ newPath }).where(eq(redirects.newPath, oldPath));
      await tx.delete(redirects).where(eq(redirects.oldPath, newPath));
      await tx
        .insert(redirects)
        .values({ oldPath, newPath })
        .onConflictDoUpdate({ target: redirects.oldPath, set: { newPath } });
    });
  } catch (err) {
    // The constraint name is in the Postgres error, which drizzle may wrap as the cause.
    const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : "";
    if (text.includes("gallery_folder_slug_unique")) {
      return { ok: false, status: 409, error: `Another gallery in this folder already uses "${slug}".` };
    }
    throw err;
  }
  return { ok: true, slug };
}
