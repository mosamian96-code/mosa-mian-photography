#!/usr/bin/env bash
# Weekly automated version of restore-drill.sh (brief section 13's manual drill,
# now scheduled instead of relying on someone remembering to run it). A backup
# nobody has successfully restored is unverified, not "safe" -- this actually
# proves the latest one restores cleanly, on a schedule, and emails immediately
# if it doesn't, instead of that only being discovered during a real disaster.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

if ./scripts/restore-drill.sh > "$OUTPUT" 2>&1; then
  if grep -qi "ERROR" "$OUTPUT"; then
    # The script itself exits 0 even when psql hit restore errors (it swallows
    # them with `|| true` so the row-count summary still prints) -- so a clean
    # exit code alone doesn't mean a clean restore. Check the captured output too.
    ./scripts/alert.sh "🟡 Weekly restore drill: backup restored with errors" "restore-drill.sh completed but the restore log contained errors. Full output:

$(cat "$OUTPUT")"
    exit 1
  fi
  echo "[restore-drill-cron] clean restore, no errors found"
  cat "$OUTPUT"
else
  ./scripts/alert.sh "🔴 Weekly restore drill FAILED" "restore-drill.sh exited with an error. Full output:

$(cat "$OUTPUT")"
  exit 1
fi
