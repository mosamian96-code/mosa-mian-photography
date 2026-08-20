# Backup and restore (brief section 13)

Three copies, per the brief: the live Postgres volume + B2 originals (copy one), this
nightly encrypted database backup in a second B2 bucket in a different region (copy
two), and a local drive at home synced with rclone (copy three, set up separately —
not part of this repo).

This doc covers copy two and the restore drill that proves it actually works. B2
originals themselves don't need a separate backup job — B2 already stores them
redundantly, and a bucket holding tens of GB of already-processed derivatives isn't
where the risk is. The risk is the Postgres database: folder/gallery structure,
captions, keywords, client links, everything that makes the objects in B2 mean
anything.

## One-time setup

1. **Create a second B2 bucket in a different region** from the main `B2_BUCKET` (e.g.
   if the main bucket is `eu-central-003`, put this one in `us-west-004` or similar).
   Private bucket, no public access needed. Create an application key scoped to just
   this bucket.
2. **Generate an encryption passphrase**: `openssl rand -base64 32`. Save it somewhere
   that is *not* this server (a password manager) — if the VPS is lost, `.env` is lost
   with it, and an encrypted backup with no key anywhere else is not a backup.
3. Fill in `.env` on the VPS: `BACKUP_ENCRYPTION_KEY`, `B2_BACKUP_KEY_ID`,
   `B2_BACKUP_APPLICATION_KEY`, `B2_BACKUP_BUCKET`.
4. **Install rclone** on the VPS host (not inside Docker — the backup script talks to
   both `docker compose` and B2 directly):
   ```bash
   curl https://rclone.org/install.sh | sudo bash
   ```
5. **Schedule the nightly cron job**:
   ```bash
   crontab -e
   # add:
   0 3 * * * /opt/mosa-mian-photography/scripts/backup-db.sh >> /var/log/mmp-backup.log 2>&1
   ```
6. Optional but recommended: set a **Lifecycle Rule** on the backup bucket in the B2
   console (e.g. "keep only the last 30 days") so old backups age out on their own
   instead of a custom pruning script.

## What the nightly job does

`scripts/backup-db.sh`: `pg_dump` via `docker compose exec postgres` (so the dump
always uses the exact pg_dump binary matching the running server — a mismatched client
version is a common reason restores silently fail), gzip, encrypt with AES-256-GCM
(`openssl enc`, PBKDF2-derived key from `BACKUP_ENCRYPTION_KEY`), upload to
`B2_BACKUP_BUCKET` via `rclone`, delete the local temp files.

## The restore drill

Brief section 13 calls for a restore drill "I actually run once" — not just a script
that exists, proof it works. Run:

```bash
./scripts/restore-drill.sh
```

This downloads the latest backup, decrypts it, and restores it into a **disposable
Postgres container** — not the real database, not the real volume, nothing it touches
can affect the live site. It prints row counts for `asset`, `folder`, `gallery`,
`client_access`, and `derivative` at the end; compare those against what
`/studio/library` and the folder list show on the live site. If they're close (exact
match only if nothing changed between the backup and now), the backup is good. The
container and temp files are removed automatically when the script exits.

Run this drill:

- Once, right after the first nightly backup exists, to prove the whole pipeline works
  end to end.
- Again any time `BACKUP_ENCRYPTION_KEY` or the B2 backup bucket changes.
- Periodically after that (e.g. quarterly) — a backup nobody has tried restoring in a
  year is a hope, not a backup.

## Actually restoring for real (not a drill)

If this is ever needed for real rather than as a drill:

1. Stop the app so nothing writes to the database mid-restore: `docker compose stop app worker`.
2. Run the same download+decrypt steps as `restore-drill.sh` (steps up through
   `gunzip`), but instead of a disposable container, restore into the real one:
   ```bash
   docker compose exec -T postgres psql -U mmp -d mmp < backup.sql
   ```
3. Restart: `docker compose start app worker`.
4. Verify via `/api/health` and a spot-check of `/studio`.

This is destructive to whatever's currently in the database, so there is no
`restore-for-real.sh` — it's deliberately a manual, read-the-steps operation, not a
one-command script that could be run by accident.
