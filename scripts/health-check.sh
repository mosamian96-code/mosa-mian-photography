#!/usr/bin/env bash
# Uptime safeguard (runs every 5 min via cron): hits the site's own /api/health
# and emails on any state *change* -- first failure after being up, or first
# success after being down -- rather than every single run, so a real outage
# sends one "it's down" email and one "it's back" email, not 288 identical
# ones over the day it takes someone to notice a spam-filtered inbox.
#
# Auto-restart added after a real incident, not speculatively: the B2 storage
# client (storage.ts's module-level S3Client singleton) has a recurring failure
# mode where it gets stuck -- every request timing out at exactly the
# configured connection timeout -- that a fresh process never reproduces (a
# throwaway script using the identical client config succeeds instantly every
# time), so it's specific to that long-lived instance's internal state, not the
# network or B2 itself. Six weeks of history in this log show it happening
# often (dozens of times) and *usually* clearing on its own within 5-50
# minutes, but the one on 2026-10-27 didn't: it stayed broken for over 33
# hours straight until manually restarted, silently breaking thumbnails and
# downloads site-wide the whole time. Restarting the app container reliably
# clears it (confirmed live), so after sustained failure (3 consecutive
# checks = ~15 minutes, past where most episodes already self-resolve) this
# restarts it automatically instead of waiting on someone to notice an email.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="/var/lib/mmp-health-state"
FAIL_COUNT_FILE="/var/lib/mmp-health-fail-count"
AUTO_RESTART_AFTER=3
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
  rm -f "$FAIL_COUNT_FILE"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [health-check] FAILING: $BODY"
  if [ "$PREV" != "down" ]; then
    "$REPO_DIR/scripts/alert.sh" "🔴 mosamianphotography.com health check failing" "The site's /api/health endpoint is reporting a failure (or not responding at all).

$BODY

This will keep failing silently until it recovers -- you'll get one more email when it does, no repeats in between. If it's still failing after ~15 minutes, this script will automatically restart the app container (a known, previously-manual fix for this specific failure mode) and email you when it does."
  fi
  echo "down" > "$STATE_FILE"

  FAIL_COUNT=0
  [ -f "$FAIL_COUNT_FILE" ] && FAIL_COUNT="$(cat "$FAIL_COUNT_FILE")"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "$FAIL_COUNT" > "$FAIL_COUNT_FILE"

  if [ "$FAIL_COUNT" -eq "$AUTO_RESTART_AFTER" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [health-check] ${AUTO_RESTART_AFTER} consecutive failures -- restarting app container"
    if (cd "$REPO_DIR" && docker compose restart app) >/tmp/mmp-auto-restart.log 2>&1; then
      "$REPO_DIR/scripts/alert.sh" "🟡 Auto-restarted the app after sustained failure" "Health check failed ${AUTO_RESTART_AFTER} times in a row (~15 minutes), so the app container was restarted automatically. You'll get the usual \"back up\" email once a check passes again -- this is just letting you know it happened and why.

$BODY"
    else
      "$REPO_DIR/scripts/alert.sh" "🔴 Auto-restart attempt failed" "Tried to restart the app container after sustained failure, but the restart command itself failed. This needs manual attention.

$(cat /tmp/mmp-auto-restart.log 2>/dev/null)"
    fi
  fi
fi
