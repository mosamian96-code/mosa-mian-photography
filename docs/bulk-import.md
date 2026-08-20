# Bulk import (brief sections 6 and 14)

Two separate paths, both bypassing the browser upload flow because it's the wrong tool
for hundreds of GB: migrating off SmugMug, and importing from a drive that was never on
SmugMug at all (anything over roughly 200GB per section 6). Both end up going through
the same ingest pipeline as any other upload — derivatives, EXIF, dedup all just work
the same way regardless of how the original got into B2.

## Path 1: migrating off SmugMug

Do this before cancelling anything (brief section 14) — there are real reports of
accounts losing access to their data at cancellation.

### 1. Get SmugMug API credentials

1. Create an API key at SmugMug's developer portal (Account Settings → Me → My
   Apps, or `https://api.smugmug.com/api/v2/webhooks!bind` → Applications). This gives
   `SMUGMUG_API_KEY` (consumer key) and `SMUGMUG_API_SECRET` (consumer secret).
2. Because this only ever exports your own account's data, skip the full OAuth
   redirect flow: generate a permanent Access Token + Secret directly from **Account
   Settings → Privacy → Full Access API Keys**. This gives `SMUGMUG_ACCESS_TOKEN` and
   `SMUGMUG_ACCESS_TOKEN_SECRET`.
3. Put all four in `.env`.

### 2. Export

```bash
npx tsx scripts/smugmug-export/export.ts ./smugmug-export
```

Walks every album via SmugMug's API, downloads every image at full original
resolution, and writes `./smugmug-export/manifest.json` (title/caption/keywords/gallery
membership per image) plus `./smugmug-export/files/` (the actual bytes). Rate-limited
(~3 req/s, no published SmugMug limit to target exactly) and resumable — re-running
after a crash or Ctrl-C picks back up via `progress.json` instead of re-downloading
everything. **This will run for days if the library is large** (brief's own estimate);
run it in `tmux`/`screen` or as a background process you can reattach to.

At the end it prints total images/bytes and compares against SmugMug's own declared
per-album counts, flagging any mismatch. **Also cross-check manually** against
SmugMug's own account overview page before trusting the export — the brief treats this
as a hard prerequisite, not optional.

### 3. Import

Run this from wherever it can reach the production database and B2 — in practice, on
the VPS via the `migrate` service's image (same reasoning as every other one-off script
in this repo: it's the only image with devDependencies and Drizzle/tsx available):

```bash
docker compose run --rm --build migrate npx tsx scripts/smugmug-export/import.ts /path/to/smugmug-export
```

(If exporting locally rather than on the VPS, copy the export directory over first —
`rsync -av ./smugmug-export/ root@<vps>:/opt/mosa-mian-photography/smugmug-export/`.)

This recreates the folder/gallery hierarchy from each album's SmugMug URL path,
uploads every original to B2, and enqueues the normal ingest job for each. It also
writes the `redirects` table, so an old bookmarked SmugMug URL like
`/Weddings/Smith-Wedding` 301s straight to the new gallery once published.

**Imported galleries are left unpublished** — nothing goes live automatically. Review
each one from `/studio` and publish deliberately, same as anything else. Idempotent —
safe to re-run if interrupted; already-imported assets and galleries are skipped, not
duplicated.

### 4. Verify, then wait

Confirm the images landed correctly (structure, captions, keywords) before cancelling
SmugMug. Brief section 14: keep the SmugMug subscription running until the new site
has served real traffic for two weeks *and* a restore drill has passed (see
[docs/restore.md](./restore.md)) — this export is a one-time snapshot, not a safety net
on its own.

## Path 2: bulk import from a drive (never was on SmugMug)

For a drive of originals too large to reasonably drag into the browser uploader.

### 1. rclone straight into B2's originals/ prefix

```bash
rclone copy /path/to/drive/photos b2:mosa-mian-photography/originals/bulk-import/ --progress
```

(`b2:` here is whatever you've named the remote in `rclone config`, using the main
`B2_KEY_ID`/`B2_APPLICATION_KEY` — not the backup bucket from docs/restore.md.)
Filenames and folder structure don't matter at this stage; the scan step below rekeys
everything.

### 2. Scan the bucket

```bash
docker compose run --rm --build migrate npx tsx scripts/scan-bucket.ts
```

Lists everything under `originals/`, finds objects with no matching `asset` row,
downloads each one to compute its sha256 (needed for dedup either way), server-side
copies it to the canonical `originals/{yyyy}/{mm}/{sha256}.{ext}` key, deletes the
old arbitrary-path object, and enqueues the normal ingest job. Safe to re-run — objects
already imported are skipped.

New assets land unsorted in `/studio/library`, same as any browser upload; add them to
folders/galleries from there. This path doesn't know about folder/gallery structure the
way the SmugMug import does (there's no equivalent of SmugMug's UrlPath to infer it
from) — organizing is a manual step here.
