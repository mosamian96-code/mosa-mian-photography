type FolderNode = { id: string; parentId: string | null; slug: string };

/**
 * Full URL path ("/public-gallery/travel") for every folder whose whole ancestor
 * chain is in `folders`. A folder with an ancestor missing from the list (because it
 * isn't public, say) gets no entry, since visitors can't reach it by browsing.
 *
 * Search used to link a gallery as "/{its folder's slug}/{gallery slug}", which only
 * works for folders at the root: every nested gallery's search result was a 404.
 */
export function buildFolderPaths(folders: FolderNode[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const paths = new Map<string, string>();

  for (const folder of folders) {
    const segments: string[] = [];
    const seen = new Set<string>();
    let current: FolderNode | undefined = folder;
    while (current) {
      // A parent loop can't happen through the studio, but a bad row must not hang
      // a public page.
      if (seen.has(current.id)) break;
      seen.add(current.id);
      segments.unshift(current.slug);
      if (!current.parentId) {
        paths.set(folder.id, "/" + segments.join("/"));
        break;
      }
      current = byId.get(current.parentId);
    }
  }
  return paths;
}
