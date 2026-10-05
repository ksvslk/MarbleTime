#!/usr/bin/env bash
# Fire OS loop on the Fire TV stick over Wi-Fi ADB: connect, install, launch, keys, shot, logs.
# Usage: scripts/fire.sh build|connect|install [apk]|launch|open <params>|grant <pkg> [a11y]|ungrant|keys <KEYCODE>...|shot [name]|logs
# The stick's address comes from .env.local: FIRETV=<ip>:5555
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/.env.local" ] && source "$ROOT/.env.local"
: "${FIRETV:?Set FIRETV=<ip>:5555 in .env.local}"
APP_ID="${APP_ID:-app.marbletime.tv}"
SHOTS="$ROOT/.shots"

cmd="${1:-}"; shift || true
case "$cmd" in
  build)   # release APK for the stick (armeabi-v7a). --rerun on the JS bundle: Gradle doesn't see edits in tv/packages/shared.
    export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}"
    [ -d "$ROOT/tv/packages/expotv/android" ] || (cd "$ROOT/tv/packages/expotv" && EXPO_TV=1 CI=1 npx expo prebuild --clean --platform android)
    (cd "$ROOT/tv/packages/expotv/android" && ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures=armeabi-v7a --console=plain -q) ;;
  connect) adb connect "$FIRETV" && adb -s "$FIRETV" shell getprop ro.build.version.sdk ;;
  install) adb -s "$FIRETV" install -r "${1:-$ROOT/tv/packages/expotv/android/app/build/outputs/apk/release/app-release.apk}" ;;
  launch)  adb -s "$FIRETV" shell monkey -p "$APP_ID" -c android.intent.category.LEANBACK_LAUNCHER 1 ;;
  open)    # scripts/fire.sh open 'screen=board&kid=mia&lang=et'  (MarbleTime test link)
    adb -s "$FIRETV" shell input keyevent KEYCODE_WAKEUP   # a screensaver ("dreaming") blocks app launches
    adb -s "$FIRETV" shell am start -a android.intent.action.VIEW -d "'marbletime://open?${1:-screen=who}'" "$APP_ID" >/dev/null ;;
  grant)   # strict-mode grants: scripts/fire.sh grant <package> [accessibility service class, e.g. .WatchdogService]
    pkg="${1:?package}"; a11y="${2:-}"
    adb -s "$FIRETV" shell appops set "$pkg" GET_USAGE_STATS allow
    adb -s "$FIRETV" shell appops set "$pkg" SYSTEM_ALERT_WINDOW allow
    adb -s "$FIRETV" shell dumpsys deviceidle whitelist +"$pkg"
    if [ -n "$a11y" ]; then
      # Note: this replaces the list of enabled accessibility services (VoiceView users would lose theirs).
      adb -s "$FIRETV" shell settings put secure enabled_accessibility_services "$pkg/$a11y"
      adb -s "$FIRETV" shell settings put secure accessibility_enabled 1
    fi ;;
  ungrant) # turn the accessibility watchdog off again
    adb -s "$FIRETV" shell settings put secure enabled_accessibility_services '""'
    adb -s "$FIRETV" shell settings put secure accessibility_enabled 0 ;;
  keys)    # e.g. scripts/fire.sh keys KEYCODE_DPAD_DOWN KEYCODE_DPAD_CENTER
    for key in "$@"; do adb -s "$FIRETV" shell input keyevent "$key"; sleep 0.4; done ;;
  shot)
    mkdir -p "$SHOTS"; out="$SHOTS/fire-${1:-shot}.png"
    adb -s "$FIRETV" exec-out screencap -p > "$out" && echo "$out" ;;
  logs)    adb -s "$FIRETV" logcat -d -s ReactNativeJS:* MarbleTime:* Strict:* ;;
  *) echo "usage: $0 build|connect|install [apk]|launch|open <params>|grant <pkg> [a11y]|ungrant|keys <KEYCODE>...|shot [name]|logs" >&2; exit 2 ;;
esac
