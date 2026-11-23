/** Folders are public or unlisted. "password" and "private" exist in the shared
 * visibility enum for galleries, but folders have no password and no client links, so
 * the API doesn't accept them for folders (and resolvePath hides any older folder row
 * that has "private", rather than treating it as unlisted). */
export const FOLDER_VISIBILITIES = ["public", "unlisted"] as const;
