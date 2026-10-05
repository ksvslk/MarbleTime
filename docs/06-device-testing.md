# 06 · Testing on your Fire TV Stick 4K Plus (and the Vega simulator)

| Device | OS | Used for |
|---|---|---|
| **Fire TV Stick 4K Plus** (yours) | **Fire OS 8** (Android 11 / API 30, 32-bit) | Everything: core app, Amazon Kids mode, strict mode, the main demo footage |
| **Vega Virtual Device** (on your Mac) | Vega OS | Showing the same app runs on Vega (the rules accept the simulator) |

> ⚠️ Don't confuse your stick with the **Fire TV Stick 4K Select / HD (2026) / 4K 3rd Gen (2026)**. Those run Vega and can't sideload APKs.
> To check: Settings → My Fire TV → About → Software Version. It says "Fire OS 8.x" on yours.

## 1. One-time ADB setup (≈10 minutes)

1. **On the TV:** Settings → **My Fire TV → About**. Highlight *Fire TV Stick 4K Plus* and press **Select 7 times**.
2. Back → **Developer options** → **ADB debugging: ON**. "Apps from unknown sources" can stay off; ADB installs don't need it.
3. Settings → My Fire TV → About → **Network**: note the **IP address**. Then reserve it in your router (DHCP reservation).
4. **On the Mac:** `adb connect <TV-IP>:5555`.
5. **On the TV:** at *"Allow USB debugging?"*, tick **Always allow from this computer** → OK.
6. `adb devices` should show `<TV-IP>:5555  device`. Give the agent the IP; it goes into `.env.local` as `FIRETV=<TV-IP>:5555`.
7. **While developing:** Settings → Display & Sounds → Screensaver → start time *Never*. Fire OS 8 also asks "Are you still watching?" after 4 h without input.

## 2. Amazon Kids setup and the day-1 questions

These checks decide how Amazon Kids mode works (04, checks K1–K3). Write the answers into `docs/spike-results.md`, or just tell the agent.

1. **Create a kids profile:** Settings → **Accounts & Profile Settings** → Add Profile → Create a New Profile → *Is this a kids profile?* **Yes** → name, birthdate, icon → **create a Child PIN** → choose content.
2. **Set a short daily limit:** open the **Parent Dashboard** (`parents.amazon.com` or the *Amazon Kids Parent Dashboard* app) → the child → Set Up Screen Time → **Daily Time Limits**, e.g. 10 minutes.
3. **K1:** switch to the kids profile and watch something allowed until the limit hits. *What does the TV show? Does it lock?*
4. **K2:** in the Parent Dashboard, use **bonus time** (one tap since app v1.22). *Does the TV unlock? How fast?*
5. **K3** (after the agent has installed MarbleTime):
   - Settings → Accounts & Profile Settings → **Kids Settings** → the profile → **Add Content**. *Is MarbleTime offered? (It's sideloaded.)*
   - Inside the kids profile, *does MarbleTime's use count toward the limit*? *Can the kid open it **after** time's up?*
   - Also check whether **Settings is blocked** in the kids profile. It should be, and that blocks the force-stop trick in strict mode.

> Amazon Kids profiles aren't available on the Fire TV Cube or some Fire TV smart TVs. The 4K Plus should be fine; K1 confirms it.

## 3. Strict mode: install and permissions (the agent does this)

```bash
scripts/fire.sh install   # build + adb install -r
scripts/fire.sh grant     # one-time grants (below), re-run after every uninstall or force-stop
scripts/fire.sh launch
```

**What `grant` does.** Fire OS has no settings screen for these permissions. The same commands work on Fire OS 8 in other projects; the spike confirms them on your stick.

```bash
PKG=app.marbletime.tv
adb shell pm grant $PKG android.permission.PACKAGE_USAGE_STATS   # which app is in front, for how long
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow             # overlays + bring the lock screen to front
adb shell dumpsys deviceidle whitelist +$PKG                     # don't let the OS put us to sleep
# optional accessibility watchdog. APPEND to the existing list, don't overwrite it
CUR=$(adb shell settings get secure enabled_accessibility_services | tr -d '\r')
[ "$CUR" = "null" ] && CUR=""
adb shell settings put secure enabled_accessibility_services "${CUR:+$CUR:}$PKG/.strict.ForegroundWatcher"
adb shell settings put secure accessibility_enabled 1
```

> Two notes:
> - A **force-stop** of MarbleTime removes it from the accessibility list.
> - While accessibility is on, **Prime Video stops auto-hiding its controls**, which is a known side effect.

## 4. Vega Virtual Device (simulator)

**You install it once.** It needs ≥ 20 GB free disk. The commands are from Amazon's Vega SDK 0.24 install guide:

```bash
[[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license
brew update && brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
vega --version
```

Then allow **Screen Recording** for your terminal app (System Settings → Privacy & Security). The agent captures the simulator window with `screencapture`; the Vega CLI can't screenshot the simulator.

**The agent runs:**
- `vega virtual-device start`
- `yarn vega:build`
- `vega run-app …`
- keys through `inputd-cli`
- logs through `loggingctl` (see 05 §5)

**Expect** that Amazon Kids profiles probably aren't available on the simulator. Amazon Kids mode is shown on the stick; Vega is shown running the same core app.

## 5. Who verifies what

| The agent can check this alone | You need to check this by eye |
|---|---|
| Install and launch on the stick and the simulator; D-pad navigation; focus order | How the real remote feels; readability from the couch |
| Screenshots of our screens and Demo Cartoons | Anything on **Netflix / Prime / Disney+** (DRM screenshots come out black) |
| Strict-mode countdown, warnings, lock and bedtime, using the **fast clock** | Sound and animations at full speed |
| Logs, backend calls (it can approve claims with curl) | The parent app on **your phone**; the Amazon Kids Parent Dashboard steps |

## 6. Test checklists

### 6.1 Core app (stick, then simulator)

| # | Scenario | Expected |
|---|---|---|
| 1 | First launch → scan QR with phone → confirm | TV shows the family and kids within ~5 s |
| 2 | Kid claims a chore | Claim appears on the phone within ~5 s |
| 3 | Parent approves (phone or TV PIN) / says "Not yet" | Marbles drop into the jar 🎉 / the job goes back on the board |
| 4 | Parent PIN on the TV | Approves without a phone; 5 wrong PINs triggers a cooldown |
| 5 | Penalty with a reason | Shown on the TV |
| 6 | Two kids | The right kid's jar changes |
| 7 | Wi-Fi off, then back on | Claims queue up and sync once, with no duplicates |
| 8 | Brain game, 3 questions | Left/right + OK only; questions are read out loud; a right answer shows the check; marbles drop at the end; a wrong answer says "Try again!" |
| 9 | *(stretch)* Voice claim | Shows up as a normal claim |
| 10 | Daily game cap reached | No more marbles from games today; jobs still earn |

### 6.2 Amazon Kids mode (stick + phone)

| # | Scenario | Expected |
|---|---|---|
| 1 | Approve a chore | PWA offers **"Add 15 min in Amazon Kids"** → opens the Parent Dashboard |
| 2 | Add bonus time, tap "done" | Kids profile unlocked; MarbleTime shows the hand-off as done |
| 3 | Penalty (−10), then an approval (+15) | Suggested hand-off is **+5** (debt netted) |
| 4 | Kids profile is locked | The kid can still claim through the phone/tablet kid view (or voice) |

### 6.3 Strict mode (stick, sideloaded)

| # | Scenario | Expected |
|---|---|---|
| 1 | Open YouTube or Demo Cartoons | Balance counts down. Home, Settings and MarbleTime **don't** count. |
| 2 | 5 and 1 minutes left | Banner over the running app |
| 3 | Balance hits 0 | Lock screen ≤ 2 s; video pauses |
| 4 | Approve a chore while locked | Unlocks by itself; balance shows +15 |
| 5 | Bypass: Home → reopen, Back spam, *"Alexa, open YouTube"* | Lock comes back every time |
| 6 | Bypass: force-stop / uninstall from Settings | Parent gets "TV not reporting" ≤ 2 min. In a kids profile, Settings is blocked. |
| 7 | Reboot the stick | Enforcement resumes; note the gap after boot |
| 8 | Wi-Fi off while watching | Countdown and lock still work; usage syncs once later |
| 9 | Bedtime window | Locked whatever the balance; parent override works |
| 10 | Screensaver / TV off | No time counted |

## 7. Recording the demo video

- **Stick:** `adb shell screenrecord --time-limit 180 /sdcard/demo.mp4`, then `adb pull /sdcard/demo.mp4`. This gives a clean 1080p capture of our screens and Demo Cartoons. DRM apps record as black.
- **Simulator:** macOS screen recording (⌘⇧5) of the VVD window.
- **Phone:** the built-in screen recorder.
- **One "real living room" shot:** film the TV and the phone together with a third camera.
- **Rules:**
  - Under 3 minutes, English, public on YouTube.
  - No third-party content or logos. Credit the CC film (e.g. *Big Buck Bunny*).
  - Label strict mode as a Fire OS prototype.
- The storyboard is in [04](04-implementation-plan.md).

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `adb connect` fails | Same Wi-Fi? ADB debugging still on? IP changed? Then `adb kill-server && adb connect <ip>:5555` |
| `unauthorized` | Accept the prompt on the TV, or turn ADB debugging off and on |
| Developer options gone after a Fire OS update | Repeat the 7× click |
| Strict mode stopped after reinstall or force-stop | `scripts/fire.sh grant` |
| `vega` not found | `source ~/vega/env` (or open a new terminal) |
| Simulator won't start | Check free disk (≥ 20 GB), Rosetta installed; `vega virtual-device start` again |
| TV monorepo won't install | `corepack enable` (it needs Yarn 4) |
| Stick unavailable | Android TV emulator (you have a google-tv image) + the Vega simulator. The FAQ says emulators are acceptable. |
