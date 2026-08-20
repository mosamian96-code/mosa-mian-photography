import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { folders, galleries } from "@/lib/db/schema";
import { listPublicKeywords } from "@/lib/public-site/resolve";

type Folder = typeof folders.$inferSelect;

export async function getAllPublicPaths(): Promise<{ path: string; lastModified?: Date }[]> {
  const allFolders = await db.query.folders.findMany({ where: eq(folders.visibility, "public") });
  const allGalleries = await db.query.galleries.findMany({
    where: and(eq(galleries.visibility, "public"), isNotNull(galleries.publishedAt)),
  });

  const folderById = new Map(allFolders.map((f) => [f.id, f]));

  function pathForFolder(folder: Folder): string[] | null {
    const segments: string[] = [folder.slug];
    let current = folder;
    while (current.parentId) {
      const parent = folderById.get(current.parentId);
      if (!parent) return null; // an ancestor isn't public — unreachable via the public tree
      segments.unshift(parent.slug);
      current = parent;
    }
    return segments;
  }

  const paths: { path: string; lastModified?: Date }[] = [];

  for (const folder of allFolders) {
    const segments = pathForFolder(folder);
    if (segments) paths.push({ path: "/" + segments.join("/") });
  }

  for (const gallery of allGalleries) {
    const folder = folderById.get(gallery.folderId);
    if (!folder) continue;
    const segments = pathForFolder(folder);
    if (!segments) continue;
    paths.push({
      path: "/" + [...segments, gallery.slug].join("/"),
      lastModified: gallery.publishedAt ?? undefined,
    });
  }

  const keywordCounts = await listPublicKeywords();
  paths.push({ path: "/keywords" });
  for (const k of keywordCounts) {
    paths.push({ path: `/keywords/${encodeURIComponent(k.value)}` });
  }

  return paths;
}
