# Mosa Mian Photography

Self-hosted SmugMug replacement. See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the full spec,
[DECISIONS.md](./DECISIONS.md) for the dated decision log, and [docs/deploy.md](./docs/deploy.md)
for how to get this onto the real VPS and domain.

Stack: Next.js (App Router) + TypeScript + Tailwind, Postgres via Drizzle, Redis + BullMQ,
Backblaze B2 for storage, Auth.js (magic link + TOTP), all in Docker behind Caddy and
Cloudflare. Not deployed to Vercel — see brief section 3 for why.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, REDIS_URL, B2_*, etc.
npm run db:generate    # regenerate SQL after a schema.ts change
npm run db:migrate     # apply pending migrations
npm run dev
```

`npm run build && npm run lint` should both pass before committing; `/studio` and `/api/*`
are forced dynamic (see `src/app/studio/layout.tsx`) since they read live DB/Redis/B2 state
and must never be statically prerendered.

## Production

`docker compose up -d` runs the whole stack (app, Postgres, Redis, Caddy). See
[docs/deploy.md](./docs/deploy.md) for VPS provisioning, DNS, and the Cloudflare Origin
Certificate Caddy needs.
