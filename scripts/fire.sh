#!/usr/bin/env bash
# Fire OS loop on the Fire TV stick over Wi-Fi ADB: connect, install, launch, keys, shot, logs.
# Usage: scripts/fire.sh build|connect|install [apk]|launch|open <params>|backend local|cloud|grant <pkg> [a11y]|ungrant|keys <KEYCODE>...|shot [name]|logs
# The stick's address comes from .env.local: FIRETV=<ip>:5555
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/.env.local" ] && source "$ROOT/.env.local"
APP_ID="${APP_ID:-app.marbletime.tv}"
SHOTS="$ROOT/.shots"

cmd="${1:-}"; shift || true
# Every command but build talks to the stick
[ "$cmd" = build ] || : "${FIRETV:?Set FIRETV=<ip>:5555 in .env.local}"
case "$cmd" in
  build)   # release APK for the stick (armeabi-v7a). --rerun on the JS bundle: Gradle doesn't see edits in tv/packages/shared.
    export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}"
    [ -d "$ROOT/tv/packages/expotv/android" ] || (cd "$ROOT/tv/packages/expotv" && EXPO_TV=1 CI=1 npx expo prebuild --clean --platform android)
    # Reanimated 4.2 links worklets' library from build/intermediates/cmake/release/obj/<abi>/, where this Gradle no
    # longer puts it, so a fresh checkout fails with "libworklets.so … missing": build worklets first and copy it there.
    w="$ROOT/tv/packages/expotv/node_modules/react-native-worklets/android/build/intermediates"
    if [ ! -f "$w/cmake/release/obj/armeabi-v7a/libworklets.so" ]; then
      (cd "$ROOT/tv/packages/expotv/android" && ./gradlew :react-native-worklets:externalNativeBuildRelease -PreactNativeArchitectures=armeabi-v7a --console=plain -q)
      mkdir -p "$w/cmake/release/obj/armeabi-v7a"
      cp "$(ls -t "$w"/cxx/RelWithDebInfo/*/obj/armeabi-v7a/libworklets.so | head -1)" "$w/cmake/release/obj/armeabi-v7a/"
    fi
    (cd "$ROOT/tv/packages/expotv/android" && ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures=armeabi-v7a --console=plain -q) ;;
  connect) adb connect "$FIRETV" && adb -s "$FIRETV" shell getprop ro.build.version.sdk ;;
  install) adb -s "$FIRETV" install -r "${1:-$ROOT/tv/packages/expotv/android/app/build/outputs/apk/release/app-release.apk}" ;;
  launch)  adb -s "$FIRETV" shell monkey -p "$APP_ID" -c android.intent.category.LEANBACK_LAUNCHER 1 ;;
  open)    # scripts/fire.sh open 'screen=board&kid=mia&lang=et'  (MarbleTime test link)
    adb -s "$FIRETV" shell input keyevent KEYCODE_WAKEUP   # a screensaver ("dreaming") blocks app launches
    adb -s "$FIRETV" shell am start -a android.intent.action.VIEW -d "'marbletime://open?${1:-screen=who}'" "$APP_ID" >/dev/null ;;
  backend) # point the TV at this Mac's dev server (backend: npm run dev) or the cloud. Its pairing stays with the old
           # backend, so the TV shows the welcome screen: pair it again from that backend's parent app.
    case "${1:-}" in
      local) # the address dev.sh prints (ipconfig and route are macOS; hostname -I is Linux)
        api="http://$(ipconfig getifaddr "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" 2>/dev/null || hostname -I | awk '{print $1}'):8787" ;;
      cloud) api="https://ny4o9o0um2.execute-api.us-east-1.amazonaws.com" ;;
      *) echo "usage: $0 backend local|cloud" >&2; exit 2 ;;
    esac
    # A running app ignores a link sent to it while in front, so start it afresh (its saved state stays).
    adb -s "$FIRETV" shell am force-stop "$APP_ID"
    "$0" open "api=$api" && echo "TV backend: $api" ;;
  grant)   # strict-mode grants: scripts/fire.sh grant <package> [accessibility service class, e.g. .WatchdogService]
    pkg="${1:?package}"; a11y="${2:-}"
    adb -s "$FIRETV" shell appops set "$pkg" GET_USAGE_STATS allow
    adb -s "$FIRETV" shell appops set "$pkg" SYSTEM_ALERT_WINDOW allow
    # Android 13+ only (the Android TV emulator): the 5- and 1-minute notes are toasts, hidden while notifications are off.
    adb -s "$FIRETV" shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
    # Android saves app-op changes up to 30 minutes later; a restart before that forgets them (seen on the emulator).
    adb -s "$FIRETV" shell appops write-settings >/dev/null
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
  *) echo "usage: $0 build|connect|install [apk]|launch|open <params>|backend local|cloud|grant <pkg> [a11y]|ungrant|keys <KEYCODE>...|shot [name]|logs" >&2; exit 2 ;;
esac
