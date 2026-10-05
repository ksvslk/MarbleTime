#!/usr/bin/env bash
# Vega loop on the Vega Virtual Device (VVD): build, start, run, keys, shot, logs.
# Usage: scripts/vega.sh build|start|stop|run|keys <KEY>...|shot [name]|logs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TV="$ROOT/tv"
VPKG="$TV/packages/vega/build/aarch64-debug/vega_aarch64.vpkg"
APP_ID="app.marbletime.tv.main"
# vda (Vega's adb) refuses to guess when the Fire TV stick is also connected over Wi-Fi ADB.
VVD_SERIAL="${VVD_SERIAL:-emulator-5554}"
SHOTS="$ROOT/.shots"

# shellcheck disable=SC1090
source "$HOME/vega/env" >/dev/null 2>&1

cmd="${1:-}"; shift || true
case "$cmd" in
  build) (cd "$TV" && yarn vega:build) ;;
  start) (cd "$TV" && vega virtual-device start --timeout 240) ;;
  stop)  (cd "$TV" && vega virtual-device stop) ;;
  run)   (cd "$TV" && vega run-app "$VPKG" "$APP_ID" -d VirtualDevice) ;;
  keys)  # e.g. scripts/vega.sh keys KEY_DOWN KEY_ENTER
    for key in "$@"; do (cd "$TV" && vega exec vda -s "$VVD_SERIAL" shell "inputd-cli button_press $key"); sleep 0.4; done ;;
  shot)  # needs Screen Recording permission for the terminal app
    mkdir -p "$SHOTS"
    win="$(swift "$ROOT/scripts/winid.swift" vega-virtual-device)"
    out="$SHOTS/vega-${1:-shot}.png"
    screencapture -x -o -l "$win" "$out" && echo "$out" ;;
  logs)  (cd "$TV" && vega exec vda -s "$VVD_SERIAL" shell "loggingctl log -f") ;;
  *) echo "usage: $0 build|start|stop|run|keys <KEY>...|shot [name]|logs" >&2; exit 2 ;;
esac
