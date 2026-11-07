#!/usr/bin/env bash
# Nightly photo/video backup, mirroring scripts/backup-db.sh's approach. The
# database backup protects metadata (galleries, users, which photo goes
# where); this protects the irreplaceable part -- the original files
# themselves -- which until now existed in exactly one place (B2_BUCKET) with
# no second copy anywhere. Only originals/ is synced, not derivatives/ or
# watermarked/: those are fully regenerable from the originals by the worker,
# so backing them up too would just be paying to store a cache.
#
# Reuses B2_BACKUP_BUCKET (the same bucket scripts/backup-db.sh already writes
# db/ dumps into) under a photos/ prefix, rather than provisioning a separate
# bucket+key -- one less credential to manage, and rclone sync only transfers
# what changed since the last run, so this stays cheap after the first pass.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

set -a
source .env
set +a

: "${B2_KEY_ID:?B2_KEY_ID not set in .env}"
: "${B2_APPLICATION_KEY:?B2_APPLICATION_KEY not set in .env}"
: "${B2_BUCKET:?B2_BUCKET not set in .env}"
: "${B2_BACKUP_KEY_ID:?B2_BACKUP_KEY_ID not set in .env}"
: "${B2_BACKUP_APPLICATION_KEY:?B2_BACKUP_APPLICATION_KEY not set in .env}"
: "${B2_BACKUP_BUCKET:?B2_BACKUP_BUCKET not set in .env}"

export RCLONE_CONFIG_MMPSOURCE_TYPE=b2
export RCLONE_CONFIG_MMPSOURCE_ACCOUNT="$B2_KEY_ID"
export RCLONE_CONFIG_MMPSOURCE_KEY="$B2_APPLICATION_KEY"

export RCLONE_CONFIG_MMPBACKUP_TYPE=b2
export RCLONE_CONFIG_MMPBACKUP_ACCOUNT="$B2_BACKUP_KEY_ID"
export RCLONE_CONFIG_MMPBACKUP_KEY="$B2_BACKUP_APPLICATION_KEY"

LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

echo "[backup-photos] syncing originals/ from ${B2_BUCKET} to ${B2_BACKUP_BUCKET}/photos/..."
if rclone sync "mmpsource:${B2_BUCKET}/originals" "mmpbackup:${B2_BACKUP_BUCKET}/photos/originals" \
  --checksum --transfers 8 --checkers 16 --log-file "$LOG_FILE" --log-level INFO; then
  TRANSFERRED="$(grep -c "Copied" "$LOG_FILE" || true)"
  echo "[backup-photos] done. Files transferred this run: ${TRANSFERRED}"
else
  echo "[backup-photos] FAILED -- see log below"
  cat "$LOG_FILE"
  "$REPO_DIR/scripts/alert.sh" "🔴 Photo backup failed" "scripts/backup-photos.sh failed tonight. Last 50 log lines:

$(tail -50 "$LOG_FILE")"
  exit 1
fi
