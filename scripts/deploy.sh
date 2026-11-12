#!/usr/bin/env bash
# Deploys the latest master to this server, rolling back automatically if the new
# version fails its health check.
#
# Usage: scripts/deploy.sh [service ...]      (default: app worker)
#
# New images are built while the current containers keep serving, so a failed
# build never touches the running site (set -e stops before anything is swapped).
# After the swap, the app must answer /api/health and the homepage, and the worker
# must log its startup line; a changed caddy/Caddyfile must pass validation before
# it's hot-reloaded. If any of that fails, the previous images, commit, and Caddy
# config are restored and an alert email goes out.
#
# HEALTH_URL overrides the health endpoint, e.g. to exercise the rollback path
# against a URL that 404s.
set -euo pipefail

SITE="https://mosamianphotography.com"
HEALTH_URL="${HEALTH_URL:-$SITE/api/health}"

app_healthy() {
  local _
  for _ in $(seq 1 40); do
    if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true' &&
      curl -fsS -o /dev/null --max-time 10 "$SITE/"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

worker_healthy() {
  local since="$1" _
  for _ in $(seq 1 30); do
    if docker compose logs --since "$since" worker 2>/dev/null | grep -q 'listening on queue "ingest"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Everything runs inside main(): `git pull` can rewrite this very file mid-deploy,
# and bash reads scripts incrementally, but parses a function body in full first.
main() {
  local repo
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$repo"

  exec 9>/var/lock/mmp-deploy.lock
  flock -n 9 || { echo "another deploy is already running"; exit 1; }

  local services=("$@")
  [ ${#services[@]} -eq 0 ] && services=(app worker)

  local prev_commit s
  prev_commit="$(git rev-parse HEAD)"
  for s in "${services[@]}"; do
    if docker image inspect "mosa-mian-photography-$s:latest" >/dev/null 2>&1; then
      docker tag "mosa-mian-photography-$s:latest" "mosa-mian-photography-$s:previous"
    fi
  done

  git checkout -q -- .
  git pull -q --ff-only
  echo "deploying $(git log -1 --format='%h %s') -> ${services[*]}"

  docker compose build -q "${services[@]}"
  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose up -d --no-build "${services[@]}"

  local failure="" caddy_changed=""
  # Caddy's config ships with the code. `up` recreates the container only if its
  # compose definition changed; a changed Caddyfile is validated, then hot-reloaded.
  docker compose up -d --no-build caddy
  if ! git diff --quiet "$prev_commit" HEAD -- caddy/; then
    caddy_changed=1
    if docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
    else
      failure="caddy/Caddyfile failed validation"
    fi
  fi

  for s in "${services[@]}"; do
    [ -n "$failure" ] && break
    case "$s" in
      app) app_healthy || failure="app failed its health check ($HEALTH_URL)" ;;
      worker) worker_healthy "$started" || failure="worker never logged its startup line" ;;
    esac
  done

  if [ -z "$failure" ]; then
    echo "deploy OK: $(git rev-parse --short HEAD)"
    return 0
  fi

  echo "$failure -- rolling back to ${prev_commit:0:7}"
  for s in "${services[@]}"; do
    if docker image inspect "mosa-mian-photography-$s:previous" >/dev/null 2>&1; then
      docker tag "mosa-mian-photography-$s:previous" "mosa-mian-photography-$s:latest"
    fi
  done
  # This checkout exists only to deploy from, so resetting it keeps `git log` here
  # matching what's actually running.
  git reset -q --hard "$prev_commit"
  docker compose up -d --no-build "${services[@]}"
  if [ -n "$caddy_changed" ]; then
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  fi

  local verdict="the previous version is back up"
  app_healthy || verdict="WARNING: the previous version is not answering its health check either"
  echo "rolled back -- $verdict"
  "$repo/scripts/alert.sh" "🔴 Deploy rolled back" "A deploy failed its health check and was rolled back automatically.

Reason: $failure
Rolled back to: ${prev_commit:0:7}
Result: $verdict" || true
  return 1
}

main "$@"
