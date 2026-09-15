#!/usr/bin/env bash
# Shared helper: sends an email via Resend's HTTP API. Used by the host-cron
# safeguard scripts (health-check.sh, backup-photos.sh, restore-drill.sh) so a
# failure in any of them reaches a human instead of sitting silently in a log
# file nobody's tailing. Deliberately a plain curl call, not the app's own
# src/lib/email.ts -- these scripts run on the host via cron, outside the app
# container, and shouldn't need a Node runtime just to send one email.
#
# Usage: alert.sh "<subject>" "<body>"
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$REPO_DIR/.env"
set +a

: "${RESEND_API_KEY:?RESEND_API_KEY not set in .env}"
ALERT_TO="${ALERT_EMAIL:-${ADMIN_EMAIL:?ADMIN_EMAIL not set in .env}}"

SUBJECT="${1:?usage: alert.sh <subject> <body>}"
BODY="${2:?usage: alert.sh <subject> <body>}"

# python3, not node -- these scripts run on the bare VPS host via cron, outside
# any container, and node isn't installed there (only inside the app/worker
# images). python3 ships with the base Ubuntu image and gives the same safe
# JSON string escaping we'd get from JSON.stringify.
PAYLOAD="$(ALERT_TO="$ALERT_TO" SUBJECT="$SUBJECT" BODY="$BODY" python3 -c '
import json, os
print(json.dumps({
    "from": "alerts@mosamianphotography.com",
    "to": os.environ["ALERT_TO"],
    "subject": os.environ["SUBJECT"],
    "html": "<pre>" + os.environ["BODY"].replace("&", "&amp;").replace("<", "&lt;") + "</pre>",
}))
')"

curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  > /tmp/alert-last-response.json

echo "[alert] sent: $SUBJECT"
