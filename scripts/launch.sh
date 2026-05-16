#!/bin/bash
# driftpet launcher — builds and runs the desktop pet.
# If already running, brings the window to front.

set -euo pipefail

REPO="/Users/mac/driftpet"
LOG="/tmp/driftpet-launch.log"
PACKAGED_APP="$REPO/release/mac-arm64/driftpet.app"

# Prefer the packaged app once it exists. macOS handles single-instance
# activation through Electron without Accessibility-only window automation.
if [ -d "$PACKAGED_APP" ]; then
  open -n "$PACKAGED_APP"
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
