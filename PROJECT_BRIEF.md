# Mosa Mian Photography — build brief v2

SmugMug replacement, self-hosted, built to run for under 200 SEK/month.

Give this to Claude Code as PROJECT_BRIEF.md at the repo root. First session: "Read PROJECT_BRIEF.md. Answer the Open Decisions questions with me, then build Phase 1 only."

## 1. Goal

Replace a SmugMug subscription with a self-hosted system that does the same work: portfolio site, unlimited galleries, full-resolution and RAW backup, client proofing galleries, upload from phone and desktop and Lightroom, watermarking, download control, and print or digital sales.

Single photographer, single admin account. No teams, no multi-tenancy, no plan tiers.

Cost target: under $20/month at 2 TB stored, scaling at $6 per additional TB.

## 2. What we are matching, and what we are not

Building:

- Folder and gallery hierarchy, arbitrarily nested, same as SmugMug's folders-inside-folders
- Unlimited galleries and images, originals stored uncompressed
- RAW backup with automatic JPEG proxy generation
- Public portfolio, unlisted galleries, password-protected galleries, expiring client links
- Client proofing: favorites, per-image comments, download control
- Watermarking, applied at derivative generation and toggleable per gallery
- Uploads from web, phone (PWA plus iOS Shortcuts), desktop folder drag, Lightroom publish plugin, and bulk rclone
- Keyword tagging, EXIF display, site-wide search, smart galleries driven by keyword rules
- Per-gallery and per-image view statistics
- Digital download sales and print sales through a print-on-demand API
- Custom domain, SEO, sitemap, OpenGraph

Not building: drag-and-drop page builder (the site design is written in code), video hosting, print fulfillment we operate ourselves, multi-user accounts, SmugMug-style public discovery or community features.

## 3. Stack, locked

Chosen for cost. Do not substitute without telling me the price difference.

- Next.js (App Router) + TypeScript + Tailwind, running in Docker on a Hetzner CX22 VPS in Falkenstein or Helsinki. Roughly €4/month, low latency to Sweden, EU data residency.
- Postgres 16 in the same Docker stack. No managed database bill.
- BullMQ + Redis for the job queue, also in the stack.
- Backblaze B2 for all object storage: $6 per TB per month, S3-compatible, so presigned multipart upload works normally.
- Cloudflare free plan in front: DNS, CDN, TLS, Turnstile, and free B2 egress through the Bandwidth Alliance. Public derivatives are served from a cdn. subdomain that proxies B2 through Cloudflare, so bandwidth costs nothing.
- Caddy for reverse proxy and automatic certificates. Deploy with Dokploy or Coolify so pushes are one command and TLS renews itself.
- sharp for raster work, exiftool-vendored for metadata and RAW preview extraction. Both run on the VPS with no serverless timeout to fight.
- Auth.js, email magic link, single allowed address, TOTP second factor.
- Resend free tier for transactional email. Stripe for payments, fees only.

Do not use Vercel. Its free tier excludes commercial use and Pro is $20/month, which is most of the budget. Do not use Next's image optimizer; all derivatives are pre-generated and served as static objects.

Running total at 2 TB: about €4 VPS, $12 storage, $1 domain amortized. Call it 170 SEK/month.

## 4. Data model

- **folders** — id, parent_id (self-referencing, arbitrary depth), slug, title, description, visibility, position. Path uniqueness enforced across siblings.
- **galleries** — id, folder_id, slug, title, description, cover_asset_id, visibility (public | unlisted | password | private), password_hash, expires_at, sort_mode, watermark_id, downloads_policy, pricelist_id, published_at.
- **assets** — id, sha256 unique, original_filename, byte_size, mime, kind (raw | jpeg | heic | sidecar), width, height, captured_at, imported_at, storage_key, status.
- **asset_metadata** — camera, lens, iso, shutter, aperture, focal_length, gps (private), raw_exif jsonb.
- **asset_groups** — links RAW to its JPEG sibling and any .xmp sidecar so they show as one library item.
- **derivatives** — asset_id, variant, format, width, height, storage_key, watermarked boolean.
- **gallery_items** — gallery_id, asset_id, position, caption. An asset can appear in many galleries; it is stored once.
- **keywords** and **asset_keywords** — free-text tags, imported from IPTC on ingest.
- **smart_gallery_rules** — gallery_id, rule jsonb (keyword, camera, date range, rating), evaluated on write.
- **client_access** — gallery_id, token, email, password_hash, expires_at, downloads_enabled, can_favorite, can_comment.
- **favorites** — client_access_id, asset_id.
- **comments** — client_access_id, asset_id, body, created_at, read_at.
- **pricelists**, **price_items** — product (digital size or print SKU), cost, markup, currency.
- **orders**, **order_items** — Stripe session id, fulfillment status, print provider order id.
- **views** — asset_id or gallery_id, day, count. Aggregate on write, no per-hit rows.
- **import_batches**, **jobs**, **contact_submissions**.

Assets are immutable after ingest. Deleting from a gallery never deletes the asset.

## 5. Storage

Single B2 bucket, three prefixes:

```
originals/{yyyy}/{mm}/{sha256}.{ext}      private, never public
derivatives/{sha256}/{variant}.{format}   public via Cloudflare, immutable, 1 year cache
watermarked/{sha256}/{variant}.{format}   public, generated only for galleries that need it
```

- Content-addressed by SHA-256. Re-uploading a file is a no-op that returns the existing asset. This is how overlapping drive folders stop costing money twice.
- Originals reach me only through presigned GET URLs valid for 5 minutes.
- Strip GPS and camera serial from every public derivative in one shared function, with a test.
- B2 lifecycle: keep prior versions 30 days.
- Derivative sizes 400, 1200, 2560 in AVIF and WebP, plus JPEG at 2560 for download-enabled galleries. Store an LQIP blur string in the database, not as an object.

## 6. Getting photos in

**Web upload.** Presigned URLs direct to B2, never through the app server. S3 multipart above 50 MB, 16 MB parts, 4 in parallel. Persist upload id and completed parts in IndexedDB so a refresh or dropped connection resumes. SHA-256 computed in a Web Worker during chunking, checked against the server before transfer starts.

**Desktop folder drag.** webkitdirectory, recursive, preserves relative path into the import batch, 6 files concurrent, per-file retry list.

**Phone PWA.** Installable, file input accepting image/* plus .dng .heic .arw .cr3 .nef .raf .orf .rw2. Screen Wake Lock while uploading. Queue survives app restart and resumes on reopen. Be honest in the UI: iOS suspends web uploads when the app is backgrounded, so the progress sheet says "keep this open" rather than pretending otherwise.

**iOS Shortcuts endpoint.** POST /api/upload-token returns a presigned PUT URL given a long-lived device token. Document a Shortcut that runs on a charger-connect automation and uploads new items from a chosen album. This is the closest thing to SmugMug's background upload that works without an App Store build. Put the Shortcut recipe in docs/ios-shortcut.md.

**Lightroom plugin.** A Lightroom Classic publish service written in Lua against the Lightroom SDK, talking to our API. Publish a collection, it uploads exported JPEGs to a mapped gallery, tracks published photos, and republishes on edit. This is the feature that makes leaving SmugMug painless, so treat it as a real deliverable in lightroom-plugin/, not an afterthought.

**Bulk from drives.** rclone straight into originals/, plus an admin "scan bucket" job that ingests objects with no database row. Anything over roughly 200 GB goes this route, not through a browser. Document it in docs/bulk-import.md.

## 7. Ingest pipeline

Runs as a BullMQ job on upload completion.

1. Verify object exists, size and hash match the claim.
2. Read metadata with exiftool. captured_at from DateTimeOriginal with original offset. Import IPTC keywords into keywords.
3. Base raster: decode JPEG/HEIC with sharp. For RAW, extract the embedded camera JPEG (exiftool -b -JpgFromRaw, falling back to -PreviewImage). Do not demosaic; the embedded preview carries the in-camera profile and is the right proxy. Log any file with no usable preview.
4. Generate derivatives, strip location data, write rows, status ready.
5. Compute LQIP.
6. Link RAW+JPEG pairs and .xmp sidecars by basename.
7. Three retries with backoff, then failed with the error text surfaced in the admin.

## 8. Public site and galleries

Routes: /, /[folder]/... nested, /[folder]/[gallery], /about, /contact, /search, /g/[token] for client access, plus sitemap.xml and per-gallery OG images.

Gallery behavior:

- Justified grid respecting native aspect ratios. No square crops.
- Lightbox with keyboard arrows and Escape, swipe on touch, deep link via ?i=, neighbor preloading, optional EXIF line under the frame.
- Slideshow mode with adjustable interval and full-screen.
- Sort by capture date, upload date, filename, or manual position.
- Progressive load: LQIP, then 1200px, then 2560px on lightbox open. Lazy below the fold, fetchpriority="high" on the hero.
- Per-gallery download policy: off, web size only, or original, with an optional per-image price gate.
- Share links for a single image and for the gallery.

## 9. Client galleries

Token URL, optional password, optional expiry date. Client can favorite, comment per image, and download whatever the gallery policy allows. Admin sees a favorites list per client and an inbox of new comments. Optional email capture before viewing, stored against client_access.

Watermarking: upload one or more PNG watermarks, position and opacity configurable, applied when derivatives are generated for a watermarked gallery. Watermarked and clean derivatives are separate objects so switching a gallery does not require reprocessing everything from the original.

Theft deterrence: cap public derivatives at 2560px, optional right-click and drag suppression. Say plainly in the admin that this is a speed bump, not protection.

## 10. Selling

Digital downloads: pricelist per gallery, Stripe Checkout, on payment success issue a presigned download URL valid 72 hours, email it, record the order.

Prints: **deferred** — the photographer currently sells digital downloads only (see Open Decisions). Build the `orders`/`order_items` schema and a `PrintProvider` interface up front so print support can be added later without a schema migration, but Phase 7 ships digital delivery only; no Gelato/Prodigi integration in v1.

Prices are set as cost plus my markup, in SEK, VAT-inclusive display. There is no commission to anyone but Stripe and the print lab, which is the point.

## 11. Search, keywords, stats

Postgres full-text over filename, title, caption, and keywords, plus filters on camera, lens, date range, and folder. Smart galleries hold a rule instead of a fixed item list and are re-evaluated when assets change.

Stats: daily counts of gallery views, image views, downloads, and referrers. Aggregate at write time into views. No third-party analytics; a per-day rollup covers what SmugMug's stats page actually gives you.

## 12. Admin

Everything under /studio, noindex, behind auth.

- Library grid, virtualized, filterable, fast at 100,000 rows. Multi-select with bulk add-to-gallery, keyword, and delete.
- Folder and gallery tree with drag reordering, publish and unpublish, settings per gallery.
- Asset detail: EXIF, derivatives, download original, soft delete with 30-day recovery.
- Upload monitor: batches, per-file progress, failures with retry.
- Client gallery manager: create links, see favorites and comments, revoke access.
- Orders, pricelists, watermarks.
- Storage dashboard: bytes stored, object count, current monthly B2 cost, count of objects not checksum-verified in 90 days.

## 13. Backups, because this replaces one

The site holding the only copy of your RAW files is not a backup. Required from Phase 2 onward:

- Nightly pg_dump encrypted and pushed to a second B2 bucket in a different region, with a documented restore drill in docs/restore.md that I actually run once.
- Monthly integrity job re-checking a rolling sample of objects against stored SHA-256, reporting mismatches.
- A local copy on a drive at home, synced with rclone, kept as the second of three copies.
- Hetzner VPS snapshot enabled, roughly €1/month.

## 14. Migrating off SmugMug

Do this before cancelling anything. Reports exist of accounts losing access to data at cancellation, so treat the export as a hard prerequisite.

1. Write a one-off script against the SmugMug API v2 to walk folders, galleries, and images, and download every original at full resolution along with its title, caption, keywords, and gallery membership.
2. Store the export locally first, verify file count and total bytes against SmugMug's own counts, then ingest into the new system so folder and gallery structure is preserved.
3. Capture existing SmugMug URLs and generate 301 redirects to matching new URLs so any links clients already have keep working.
4. Keep the SmugMug subscription running until the new site has served real traffic for two weeks and a restore drill has passed.

Put this in scripts/smugmug-export/ with a resumable, rate-limited downloader. It will run for days if the library is large.

## 15. Design

The photographs supply all the color. The interface is achromatic: no brand hue, no gradients, no glass. Chrome recedes so one image can hold the viewport.

Before writing UI code, produce docs/design-tokens.md with a 5-6 value neutral palette, two self-hosted typefaces with defined roles, a type scale, a 4px spacing scale, and one radius. Commit to light or dark ground; no theme toggle in v1 (**light ground**, see Open Decisions). Avoid Instrument Serif, Playfair, and Space Grotesk, which read as template picks. Show me two candidate typeface pairings with a one-line rationale before choosing.

Pick one signature element and cut the rest: a folder index that reveals its cover as a thin horizontal strip on hover rather than a card grid; a lightbox that fixes shutter, aperture, and ISO as a typographic line under the frame; a landing sequence where the hero resolves from its own blur placeholder once per session.

Motion 150-350ms, transform and opacity only, no parallax, no scroll-jacking. Honor prefers-reduced-motion by zeroing duration rather than removing state changes. Design the grid at 390px first. Keyboard focus visible, contrast 4.5:1, touch targets 44px.

Budgets: LCP under 2.0s on 4G mobile, CLS under 0.05, under 120KB JS on public routes, Lighthouse 95+ on performance, accessibility, and SEO, checked in CI.

## 16. Build phases

1. **Foundation.** Docker stack on the VPS, Postgres, migrations, auth, B2 client, Caddy and Cloudflare wired, /studio shell, health check that round-trips a test object. Done when I can log in over HTTPS on the real domain.
2. **Ingest and library.** Presigned multipart upload, dedup, job queue, exiftool, derivatives, RAW preview extraction, library grid with filters, nightly database backup. Done when a folder of 20 mixed CR3 and JPEG files drags in, appears correctly, and a second drop of the same folder adds nothing.
3. **Structure and public site.** Folders, galleries, design tokens approved, justified grid, lightbox, slideshow, SEO. Done when a published gallery is live and meets the performance budgets.
4. **Clients.** Token access, passwords, expiry, favorites, comments, download policies, watermarks, contact form with Turnstile.
5. **Migration.** SmugMug exporter, bulk ingest, redirect map, restore drill. Done when the full library is in and verified by count and checksum.
6. **Mobile and Lightroom.** PWA with resumable queue and wake lock, Shortcuts endpoint and recipe, Lightroom publish plugin.
7. **Selling.** Digital delivery via Stripe Checkout and pricelists, orders admin. (Print provider integration deferred — digital-only per Open Decisions.)
8. **Hardening.** Search, smart galleries, stats, integrity job, storage dashboard, Playwright coverage of upload, gallery, and checkout.

Phases 1 through 5 are the ones that let me cancel the subscription. Everything after is improvement.

## 17. Open decisions

Answered 2026-08-18:

1. **Current library size / growth**: 1–2 TB currently, growing steadily (~1 TB/year working assumption). Near the 2 TB cost baseline in section 3 — storage cost and the rclone bulk-import path (section 6) matter from early on, not just at migration time.
2. **Prints vs digital only**: Digital downloads only, today. Phase 7 ships Stripe Checkout + digital delivery; no print-on-demand provider in v1. Schema (`orders`, `pricelists`) and a `PrintProvider` interface are still built so prints can be added later without a migration.
3. **Editing tool**: Lightroom Classic. The plugin in `lightroom-plugin/` targets the Lightroom Classic SDK (Lua) per section 6, as originally specced.
4. **Ground**: Light. Design tokens (section 15, docs/design-tokens.md) use a light neutral palette, dark text/chrome, no theme toggle in v1.
5. **Domain**: Not yet registered. Phase 1 will build and verify the Docker/Caddy/Cloudflare wiring against a placeholder domain locally; the "log in over HTTPS on the real domain" done-criterion is blocked on registering a domain and provisioning the Hetzner VPS, both of which require the photographer to act (payment, account creation) — Claude Code does not have a way to do this autonomously.

## 18. Environment

```
DATABASE_URL=
REDIS_URL=
AUTH_SECRET=
AUTH_URL=
ADMIN_EMAIL=
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET=
B2_ENDPOINT=
CDN_BASE_URL=
RESEND_API_KEY=
CONTACT_TO_EMAIL=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PRINT_PROVIDER_API_KEY=
```

Commit .env.example with empty values. No secret is ever read in a client component.

## 19. How to work

Ask the Open Decisions questions first. Build phases in order, finish one before starting the next, vertical slices over scaffolding. Show me the schema and the storage key layout before implementing against them. When a choice has a cost or lock-in tradeoff, stop and give me the tradeoff in two sentences. Keep DECISIONS.md with dated one-line entries. No lorem ipsum in committed code.
