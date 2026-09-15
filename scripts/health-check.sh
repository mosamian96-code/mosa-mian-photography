#!/usr/bin/env bash
# Uptime safeguard (runs every 5 min via cron): hits the site's own /api/health
# and emails on any state *change* -- first failure after being up, or first
# success after being down -- rather than every single run, so a real outage
# sends one "it's down" email and one "it's back" email, not 288 identical
# ones over the day it takes someone to notice a spam-filtered inbox.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="/var/lib/mmp-health-state"
URL="https://mosamianphotography.com/api/health"

BODY="$(curl -sS --max-time 15 "$URL" || echo '{"ok":false,"error":"request failed"}')"
OK="$(echo "$BODY" | python3 -c 'import json,sys
try:
    print("true" if json.load(sys.stdin).get("ok") is True else "false")
except Exception:
    print("false")')"

PREV="unknown"
[ -f "$STATE_FILE" ] && PREV="$(cat "$STATE_FILE")"

if [ "$OK" = "true" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [health-check] ok"
  if [ "$PREV" = "down" ]; then
    "$REPO_DIR/scripts/alert.sh" "✅ mosamianphotography.com is back up" "Health check passed again after a prior failure.

$BODY"
  fi
  echo "up" > "$STATE_FILE"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [health-check] FAILING: $BODY"
  if [ "$PREV" != "down" ]; then
    "$REPO_DIR/scripts/alert.sh" "🔴 mosamianphotography.com health check failing" "The site's /api/health endpoint is reporting a failure (or not responding at all).

$BODY

This will keep failing silently until it recovers -- you'll get one more email when it does, no repeats in between."
  fi
  echo "down" > "$STATE_FILE"
fi
