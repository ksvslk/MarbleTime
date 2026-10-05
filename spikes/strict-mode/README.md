# Strict-mode spike (throw-away)

Answers day-1 checks **S1–S6** from docs/04 on the Fire TV stick before we build the real Kotlin module in M3.
Plain Kotlin, no AndroidX, same AGP/Kotlin as the Expo TV build. Package `app.timejar.spike`.

## Build and install

```bash
cd spikes/strict-mode && ./gradlew assembleRelease           # → app/build/outputs/apk/release/app-release.apk
scripts/fire.sh connect
scripts/fire.sh install spikes/strict-mode/app/build/outputs/apk/release/app-release.apk
scripts/fire.sh grant app.timejar.spike                      # usage access, overlay, battery whitelist
scripts/fire.sh grant app.timejar.spike .WatchdogService     # …plus the accessibility watchdog (S2/S4/S5)
```

Open "TimeJar spike" on the stick → **Start**. Logs: `adb -s $FIRETV logcat -s Strict` (lines like `Strict: state=Locked fg=… bal=0`).
Fast clock (1 s of use = 1 min): the **Fast clock** button, or `adb shell am broadcast -n app.timejar.spike/.DebugReceiver -a app.timejar.spike.FAST --ez on true`.

## Checks

| # | How | Pass if |
|---|---|---|
| S1 | Open YouTube, Netflix, Prime Video; watch `sinceFgMs` in the `state=` log lines | each detected, ≤ 2 s |
| S2 | **Empty jar**, then open each app (the agent screenshots; DRM apps show black, so **you** confirm by eye) | lock screen ≤ 2 s, video pauses |
| S3 | From the lock screen press Home, reopen the app; say *"Alexa, open YouTube"* | locks again every time |
| S4 | Reboot; leave it 2 h idle; with and without `.WatchdogService` | `Strict: boot completed` / `service created` within 60 s |
| S5 | Accessibility on, play Prime Video, wait | do the playback controls still auto-hide? (decides the default) |
| S6 | Settings → Applications → force stop; heartbeat silence; does a kid profile block Settings? does `adb connect 127.0.0.1:5555` work on the stick itself? | notes in docs/spike-results.md |

Undo the accessibility grant with `scripts/fire.sh ungrant`. Uninstall with `adb uninstall app.timejar.spike`.
