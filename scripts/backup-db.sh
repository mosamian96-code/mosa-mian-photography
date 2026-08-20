#!/usr/bin/env bash
# Nightly encrypted database backup (brief section 13). Runs on the VPS host via cron,
# not inside Docker -- pg_dump has to match the postgres container's own major version
# exactly (Debian's default postgresql-client package lags behind), so the dump runs
# through `compose exec` against the postgres container's own binary instead of one
# bundled into our own image.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

set -a
source .env
set +a

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"
: "${B2_BACKUP_KEY_ID:?B2_BACKUP_KEY_ID not set in .env}"
: "${B2_BACKUP_APPLICATION_KEY:?B2_BACKUP_APPLICATION_KEY not set in .env}"
: "${B2_BACKUP_BUCKET:?B2_BACKUP_BUCKET not set in .env}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"
DUMP_FILE="$TMP_DIR/mmp-${TIMESTAMP}.sql.gz"
ENC_FILE="$DUMP_FILE.enc"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[backup] dumping database..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-mmp}" "${POSTGRES_DB:-mmp}" | gzip > "$DUMP_FILE"

echo "[backup] encrypting..."
openssl enc -aes-256-gcm -pbkdf2 -iter 100000 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -in "$DUMP_FILE" -out "$ENC_FILE"

echo "[backup] uploading to B2 (bucket: ${B2_BACKUP_BUCKET})..."
RCLONE_CONFIG_MMPBACKUP_TYPE=b2 \
RCLONE_CONFIG_MMPBACKUP_ACCOUNT="$B2_BACKUP_KEY_ID" \
RCLONE_CONFIG_MMPBACKUP_KEY="$B2_BACKUP_APPLICATION_KEY" \
rclone copyto "$ENC_FILE" "mmpbackup:${B2_BACKUP_BUCKET}/db/mmp-${TIMESTAMP}.sql.gz.enc"

echo "[backup] done: mmp-${TIMESTAMP}.sql.gz.enc"
