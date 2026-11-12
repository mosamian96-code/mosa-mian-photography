#!/usr/bin/env bash
# Deploys the latest master to this server, rolling back automatically if the new
# version fails.
#
# Usage: scripts/deploy.sh [service ...]      (default: app worker)
#
# New images are built while the current containers keep serving, so a failed build
# never touches the running site (set -e stops before anything is swapped). Database
# migrations then run before the swap, so new code never starts against an old
# schema (they must stay compatible with the version still serving). After the swap,
# the app must answer /api/health and the homepage, and the worker must log its
# startup line; a changed caddy/Caddyfile must pass validation before it's
# hot-reloaded. If any of that fails, the previous images, commit, and Caddy config
# are restored and an alert email goes out.
#
# HEALTH_URL overrides the health endpoint, e.g. to exercise the rollback path
# against a URL that 404s. DEPLOY_COMMIT deploys that commit (fast-forward only)
# instead of the latest master -- CI uses it to deploy exactly what it tested.
set -euo pipefail

SITE="https://mosamianphotography.com"
HEALTH_URL="${HEALTH_URL:-$SITE/api/health}"

app_healthy() {
  local url="$1" _
  for _ in $(seq 1 40); do
    if curl -fsS --max-time 5 "$url" 2>/dev/null | grep -q '"ok":true' &&
      curl -fsS -o /dev/null --max-time 10 "$SITE/"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

worker_healthy() {
  local since="$1" _ id started
  for _ in $(seq 1 30); do
    id="$(docker compose ps -q worker)"
    if [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$id")" = "true" ]; then
      started="$(docker inspect -f '{{.State.StartedAt}}' "$id")"
      # Not restarted by this deploy (its image didn't change), so it's the worker
      # that was already running -- a recreated one must log its startup line.
      [[ "${started:0:19}" < "${since:0:19}" ]] && return 0
      docker compose logs --since "$since" worker 2>/dev/null | grep -q 'listening on queue "ingest"' && return 0
    fi
    sleep 2
  done
  return 1
}

# Restores the previous images, commit, and Caddy config. Reads main()'s locals
# (bash functions see their caller's variables).
rollback() {
  local reason="$1" s
  echo "$reason -- rolling back to ${prev_commit:0:7}"
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
  app_healthy "$SITE/api/health" || verdict="WARNING: the previous version is not answering its health check either"
  echo "rolled back -- $verdict"
  "$repo/scripts/alert.sh" "🔴 Deploy rolled back" "A deploy failed and was rolled back automatically.

Reason: $reason
Rolled back to: ${prev_commit:0:7}
Result: $verdict" || true
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

  local prev_commit s caddy_changed=""
  prev_commit="$(git rev-parse HEAD)"
  for s in "${services[@]}"; do
    if docker image inspect "mosa-mian-photography-$s:latest" >/dev/null 2>&1; then
      docker tag "mosa-mian-photography-$s:latest" "mosa-mian-photography-$s:previous"
    fi
  done

  git checkout -q -- .
  if [ -n "${DEPLOY_COMMIT:-}" ]; then
    git fetch -q origin
    git merge -q --ff-only "$DEPLOY_COMMIT"
  else
    git pull -q --ff-only
  fi
  echo "deploying $(git log -1 --format='%h %s') -> ${services[*]}"

  docker compose build -q "${services[@]}" migrate

  if ! docker compose run --rm migrate >/tmp/mmp-migrate.log 2>&1; then
    cat /tmp/mmp-migrate.log
    rollback "database migration failed"
    return 1
  fi

  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose up -d --no-build "${services[@]}"

  # Caddy's config ships with the code. `up` recreates the container only if its
  # compose definition changed; a changed Caddyfile is validated, then hot-reloaded.
  local failure=""
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
      app) app_healthy "$HEALTH_URL" || failure="app failed its health check ($HEALTH_URL)" ;;
      worker) worker_healthy "$started" || failure="worker never logged its startup line" ;;
    esac
  done

  if [ -n "$failure" ]; then
    rollback "$failure"
    return 1
  fi
  echo "deploy OK: $(git rev-parse --short HEAD)"
}

main "$@"
