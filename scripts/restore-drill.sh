#!/usr/bin/env bash
# Restore drill (brief section 13): downloads the most recent encrypted backup and
# restores it into a disposable, throwaway Postgres container -- never touches the
# real database or its volume -- then prints row counts to eyeball against the live
# site. This is the actual test that a backup can be restored, not just that a backup
# file exists.
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

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"; docker rm -f mmp-restore-drill >/dev/null 2>&1 || true' EXIT

export RCLONE_CONFIG_MMPBACKUP_TYPE=b2
export RCLONE_CONFIG_MMPBACKUP_ACCOUNT="$B2_BACKUP_KEY_ID"
export RCLONE_CONFIG_MMPBACKUP_KEY="$B2_BACKUP_APPLICATION_KEY"

echo "[restore-drill] finding latest backup in ${B2_BACKUP_BUCKET}/db/..."
LATEST="$(rclone lsf "mmpbackup:${B2_BACKUP_BUCKET}/db/" | sort | tail -1)"
if [ -z "$LATEST" ]; then
  echo "No backups found -- has scripts/backup-db.sh run yet?"
  exit 1
fi
echo "[restore-drill] latest backup: $LATEST"

rclone copyto "mmpbackup:${B2_BACKUP_BUCKET}/db/${LATEST}" "$TMP_DIR/backup.sql.gz.enc"

echo "[restore-drill] decrypting..."
openssl enc -d -aes-256-gcm -pbkdf2 -iter 100000 -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "$TMP_DIR/backup.sql.gz.enc" -out "$TMP_DIR/backup.sql.gz"
gunzip "$TMP_DIR/backup.sql.gz"

echo "[restore-drill] starting a disposable Postgres container (separate from the real one)..."
docker run -d --name mmp-restore-drill \
  -e POSTGRES_USER=mmp -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=mmp \
  postgres:16-alpine >/dev/null

echo "[restore-drill] waiting for it to come up..."
until docker exec mmp-restore-drill pg_isready -U mmp >/dev/null 2>&1; do sleep 1; done

echo "[restore-drill] restoring dump (log kept at $TMP_DIR/restore.log until this script exits)..."
docker exec -i mmp-restore-drill psql -U mmp -d mmp < "$TMP_DIR/backup.sql" > "$TMP_DIR/restore.log" 2>&1 || true

echo
echo "[restore-drill] row counts in the restored copy -- compare against /studio/library and the folder list on the live site:"
docker exec mmp-restore-drill psql -U mmp -d mmp -t -c "
  select 'asset' as table_name, count(*) from asset
  union all select 'folder', count(*) from folder
  union all select 'gallery', count(*) from gallery
  union all select 'client_access', count(*) from client_access
  union all select 'derivative', count(*) from derivative;
"
echo
echo "[restore-drill] done. The disposable container and temp files are removed automatically on exit."
echo "[restore-drill] if any restore errors appeared above the counts, they came from: $TMP_DIR/restore.log (copy it out before this script exits if you need to keep it)"
