# Deploying Phase 1

Everything in this repo is built and can be verified locally, but the Phase 1 done-criterion
("log in over HTTPS on the real domain") needs things Claude Code cannot do on its own: paying
for a Hetzner VPS and running commands on that VPS's shell. This doc is the checklist for
doing those steps yourself.

## 1. Domain — done

`mosamianphotography.com` is registered and active.

## 2. Provision the Hetzner VPS

1. Create a Hetzner Cloud account, then a **CX22** server in the **Falkenstein** or
   **Helsinki** region, Ubuntu 24.04 image. ~€4/month.
2. Enable Hetzner's automatic snapshot add-on (~€1/month) — this is the "one copy" from
   section 13's backup list that isn't your responsibility to script.
3. SSH in, then install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

## 3. Point DNS at the VPS through Cloudflare

1. Add `mosamianphotography.com` to Cloudflare (free plan) if not already there, update the
   registrar's nameservers to Cloudflare's.
2. Create an `A` record for `@` (and one for `www`) pointing at the VPS's public IP, proxy
   status **on** (orange cloud) — this is what gives you free B2 egress via the Bandwidth
   Alliance later and DDoS/WAF coverage now.
3. Create an `A` record for `cdn.mosamianphotography.com` — used from Phase 3 onward to serve
   derivatives out of B2 through Cloudflare's proxy. Not required for Phase 1.
4. In Cloudflare **SSL/TLS**, set the mode to **Full (strict)**.

## 4. Generate the origin certificate

Cloudflare → SSL/TLS → Origin Server → **Create Certificate**. Accept the defaults (RSA,
15 years); make sure the hostnames cover `mosamianphotography.com` and
`*.mosamianphotography.com`. Save the two outputs on the VPS:

```
/opt/mosa-mian-photography/certs/origin-cert.pem
/opt/mosa-mian-photography/certs/origin-key.pem
```

This is why Caddy doesn't need Let's Encrypt here — Cloudflare already trusts this cert, and
"Full (strict)" means Cloudflare *requires* the origin to present one. The `Caddyfile` in this
repo is already pointed at `mosamianphotography.com` and `www.mosamianphotography.com` — no
edit needed there.

## 5. Get the code onto the server

Simplest path for a solo project: `git clone` this repo onto the VPS, or push to a small
private Git remote and pull from there. (Dokploy/Coolify, per the brief's stack, wrap this in
a one-command redeploy — install one of those once Phase 1 is stable and you're deploying
often; not required to get the first login working.)

## 6. Configure environment and secrets

On the VPS, copy `.env.example` to `.env` and fill in every value:

- `DATABASE_URL` — `postgresql://mmp:<POSTGRES_PASSWORD>@postgres:5432/mmp` (matches the
  `postgres` service in docker-compose.yml; use the same password for both).
- `REDIS_URL` — `redis://redis:6379`
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` — `https://mosamianphotography.com`
- `ADMIN_EMAIL` — the one address allowed to sign in.
- `B2_*` — from a Backblaze B2 application key scoped to one bucket.
- `RESEND_API_KEY` — from Resend, free tier.
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — compose-only, bootstraps the
  Postgres container (see the comment in `.env.example`).

## 7. Run migrations and start the stack

```bash
docker compose run --rm migrate
docker compose up -d
```

(`migrate` builds from the Dockerfile's `builder` stage, which still has drizzle-kit and
the rest of devDependencies — the `app` service's final image is deliberately slimmed to
Next's standalone output and doesn't carry dev tooling, so `docker compose run --rm app
npm run db:migrate` fails with `drizzle-kit: not found`.)

## 8. Verify

- `curl https://mosamianphotography.com/api/health` — expect `{"ok":true,...}` with
  `database`, `redis`, and `storage` all `ok: true`. `storage: true` means the B2 round-trip
  (write, read back, delete a test object) succeeded — that's Phase 1's actual proof B2
  credentials work, not just that they're present in `.env`.
- Visit `https://mosamianphotography.com/studio/login`, sign in with `ADMIN_EMAIL`, follow the
  emailed link, scan the TOTP QR code with an authenticator app, confirm the 6-digit code. You
  should land on `/studio` showing all three health checks green.

That last step is the actual Phase 1 done-criterion: logged in, over HTTPS, on the real
domain.
