/** Fixed identities shared by e2e/seed.ts and the browser tests. ADMIN_EMAIL in the
 * test environment must match adminEmail. */
export const E2E = {
  adminEmail: "e2e@example.com",
  adminPassword: "e2e-password-not-secret",
  folderId: "e2e-folder",
  folderSlug: "e2e",
  galleryId: "e2e-gallery",
  gallerySlug: "e2e-gallery",
  clientAccessId: "e2e-client-access",
  clientToken: "e2e-client-link",
} as const;
