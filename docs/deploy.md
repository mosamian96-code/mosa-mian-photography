# Deploying Phase 1

Everything in this repo is built and can be verified locally, but the Phase 1 done-criterion
("log in over HTTPS on the real domain") needs three things Claude Code cannot do on its own:
paying for a domain, paying for a Hetzner VPS, and running commands on that VPS's shell. This
doc is the checklist for doing those steps yourself.

## 1. Register the domain

Not done yet (see PROJECT_BRIEF.md section 17). Any registrar is fine; Cloudflare Registrar
(at-cost pricing) is a reasonable default since Cloudflare is already in the stack.

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

1. Add the domain to Cloudflare (free plan), update the registrar's nameservers to
   Cloudflare's.
2. Create an `A` record for the apex/subdomain pointing at the VPS's public IP, proxy status
   **on** (orange cloud) — this is what gives you free B2 egress via the Bandwidth Alliance
   later and DDoS/WAF coverage now.
3. Create a `CNAME` (or second `A` record) for `cdn.your-domain` — used from Phase 3 onward
   to serve derivatives out of B2 through Cloudflare's proxy. Not required for Phase 1.
4. In Cloudflare **SSL/TLS**, set the mode to **Full (strict)**.

## 4. Generate the origin certificate

Cloudflare → SSL/TLS → Origin Server → **Create Certificate**. Accept the defaults (RSA,
15 years, covers `your-domain` and `*.your-domain`). Save the two outputs on the VPS:

```
/opt/mosa-mian-photography/certs/origin-cert.pem
/opt/mosa-mian-photography/certs/origin-key.pem
```

This is why Caddy doesn't need Let's Encrypt here — Cloudflare already trusts this cert, and
"Full (strict)" means Cloudflare *requires* the origin to present one.

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
- `AUTH_URL` — `https://your-domain`
- `ADMIN_EMAIL` — the one address allowed to sign in.
- `B2_*` — from a Backblaze B2 application key scoped to one bucket.
- `RESEND_API_KEY` — from Resend, free tier.
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — compose-only, bootstraps the
  Postgres container (see the comment in `.env.example`).

Edit `Caddyfile` and replace `your-domain.example` with the real domain, and `email
admin@example.com` with a real address (used only for Caddy's own notices, unrelated to ACME
here since we're not using Let's Encrypt).

## 7. Run migrations and start the stack

```bash
docker compose run --rm app npm run db:migrate
docker compose up -d
```

## 8. Verify

- `curl https://your-domain/api/health` — expect `{"ok":true,...}` with `database`, `redis`,
  and `storage` all `ok: true`. `storage: true` means the B2 round-trip (write, read back,
  delete a test object) succeeded — that's Phase 1's actual proof B2 credentials work, not
  just that they're present in `.env`.
- Visit `https://your-domain/studio/login`, sign in with `ADMIN_EMAIL`, follow the emailed
  link, scan the TOTP QR code with an authenticator app, confirm the 6-digit code. You should
  land on `/studio` showing all three health checks green.

That last step is the actual Phase 1 done-criterion: logged in, over HTTPS, on the real
domain.
