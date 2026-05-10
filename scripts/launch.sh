#!/bin/bash
# driftpet launcher — builds and runs the desktop pet.
# If already running, brings the window to front.

set -euo pipefail

REPO="/Users/mac/driftpet"
LOG="/tmp/driftpet-launch.log"

# If already running, just show the window.
if pgrep -f "Electron.*driftpet" >/dev/null 2>&1; then
  osascript -e '
  tell application "System Events"
    set procs to every process whose name contains "Electron"
    repeat with p in procs
      set wins to every window of p
      if (count of wins) > 0 then
        set frontmost of p to true
        repeat with w in wins
          perform action "AXRaise" of w
        end repeat
      end if
    end repeat
  end tell' >/dev/null 2>&1
  exit 0
fi

exec >>"$LOG" 2>&1
echo "=== driftpet launch $(date) ==="

cd "$REPO"

# Build only if source is newer than last build.
NEED_BUILD=0
if [ ! -f dist-electron/electron/main.js ]; then
  NEED_BUILD=1
else
  NEWEST_SRC=$(find electron src -name '*.ts' -newer dist-electron/electron/main.js 2>/dev/null | head -1)
  if [ -n "$NEWEST_SRC" ]; then
    NEED_BUILD=1
  fi
fi

if [ "$NEED_BUILD" = "1" ]; then
  echo "Building..."
  npm run build 2>&1
fi

echo "Starting electron..."
exec npx electron .
