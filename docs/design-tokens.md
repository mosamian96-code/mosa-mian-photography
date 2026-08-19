# Design tokens

Per PROJECT_BRIEF.md section 15. The photographs supply all the color; everything here
exists to recede.

## Ground

**Light**, committed for v1 — no dark mode, no theme toggle (decided 2026-08-18).

## Palette

Five neutrals, achromatic. No brand hue anywhere.

| Token | Value | Use |
|---|---|---|
| `--surface` | `#ffffff` | Page background |
| `--surface-muted` | `#fafafa` | Studio chrome, cards, hover fills |
| `--border` | `#e5e5e5` | Hairlines, dividers |
| `--ink-muted` | `#737373` | Secondary text, EXIF line, captions |
| `--ink` | `#171717` | Primary text, titles |

Contrast: `--ink` on `--surface` is 17.9:1, `--ink-muted` on `--surface` is 4.6:1 — both
clear 4.5:1 for body text.

## Typefaces

Two, self-hosted via `next/font/google` (downloaded at build time, served from our own
origin — never a `fonts.googleapis.com` request at runtime). Chosen to avoid Instrument
Serif / Playfair / Space Grotesk, which read as template picks (brief section 15).

| Role | Family | Weights | Notes |
|---|---|---|---|
| Display | **Fraunces** | 300 (light), optical size `opsz` at large sizes | Gallery/folder titles, hero. A warm, slightly crafted serif — editorial without being ubiquitous. |
| Body / UI | **Inter** | 400, 500, 600 | Everything else: nav, captions, EXIF line, studio admin, buttons. Near-invisible at small sizes, which is the point. |

CSS variables: `--font-display` (Fraunces), `--font-body` (Inter).

## Type scale

4px-rooted, used for both display and body sizes:

| Token | Size | Line height | Typical use |
|---|---|---|---|
| `--text-xs` | 12px | 16px | EXIF line, metadata, timestamps |
| `--text-sm` | 14px | 20px | Captions, nav, admin body |
| `--text-base` | 16px | 24px | Body copy |
| `--text-lg` | 20px | 28px | Section labels |
| `--text-xl` | 28px | 34px | Gallery/folder titles (Fraunces) |
| `--text-2xl` | 40px | 46px | Page titles (Fraunces) |
| `--text-3xl` | 64px | 68px | Landing hero (Fraunces) |

## Spacing

4px base unit, standard multiples: `--space-1` (4px) through `--space-16` (64px), i.e.
`--space-{n} = n * 4px`. No off-scale values anywhere.

## Radius

One value: `--radius: 4px`. Used everywhere something needs a corner — thumbnails,
buttons, inputs, cards. No second radius.

## Motion

150–350ms, `transform` and `opacity` only — no layout-triggering properties, no
parallax, no scroll-jacking. `prefers-reduced-motion: reduce` zeroes duration (state
still changes, just instantly) rather than removing transitions outright.

## Signature element

One, per section 15's "pick one and cut the rest": **the lightbox fixes shutter,
aperture, ISO, and lens as a single typographic line under the frame** — plain `Inter`
at `--text-xs`, `--ink-muted`. This reuses the EXIF data the Phase 2 ingest pipeline
already extracts into `asset_metadata` (camera, lens, iso, shutter, aperture),
matches brief section 8's "optional EXIF line under the frame," and needed no new
signature-specific machinery beyond what ingest already produces — the folder-hover
strip and blur-placeholder hero sequence are cut, not built.

## Budgets (brief section 15, checked before Phase 3 is done)

- LCP < 2.0s on 4G mobile
- CLS < 0.05
- < 120KB JS on public routes
- Lighthouse 95+ performance / accessibility / SEO
