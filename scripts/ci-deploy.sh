#!/usr/bin/env bash
# Entry point for automatic deploys from GitHub Actions. The deploy key in root's
# authorized_keys is pinned to this script (restrict,command="..."), so this is the
# only thing that key can run, whatever command the client sends.
#
# The client may send the commit to deploy (CI sends the one it just tested); it's
# accepted only as a full 40-character hex SHA. deploy.sh runs in its own session
# with output to a log, so a dropped SSH connection (a cancelled job, a runner
# hiccup) can't kill a deploy halfway; this waits for it, then replays the log.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

requested="${SSH_ORIGINAL_COMMAND:-}"
if [[ "$requested" =~ ^[0-9a-f]{40}$ ]]; then
  export DEPLOY_COMMIT="$requested"
elif [ -n "$requested" ]; then
  echo "ignoring unrecognized request: ${requested:0:80}"
fi

log=/var/log/mmp-deploy.log
setsid -w scripts/deploy.sh > "$log" 2>&1 < /dev/null
status=$?
grep -v "Container\|Image mosa" "$log"
exit $status
