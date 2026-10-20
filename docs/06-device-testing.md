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

**Results, Oct 19, on the Android TV emulator** (Google TV image, Android 14, AVD `marbletime-tv`; a sample family on a throwaway backend; fast clock, 1 s = 1 min). The stick run on Oct 12 covered rows 1 and 3.

| # | Result |
|---|---|
| 1 | ✅ "Who's watching?" 1.2 s after the video app opened. Google TV's home and settings stay free (added to the allowlist next to Fire TV's). |
| 2 | ✅ "5 minutes left" and "1 minute left" over the video. Android 13+ hides them until the app may post notifications (`fire.sh grant` now grants it; Fire OS 8 is Android 11 and has no such switch; not yet seen on the stick). |
| 3 | ✅ Locked at the right second (50 and 70 min jars). The picker showed the jar's old minutes for up to ~20 s after the lock: the TV's sync dropped a "fetch now" that came while a fetch was running. **Fixed** (`sync.tsx` runs it right after): about a second after the lock the kid shows 0 min. |
| 4 | ✅ An approval reached the locked TV within 6 s, and the kid could watch again. **Bug found and fixed:** a kid whose jar ran out stayed ticked, so a sibling with time pressing Watch was locked out at once ("Leo's jar is empty"). Now an emptied kid drops out of the picked ones (`stillPicked`, unit-tested) and the remote starts on the first kid with time. |
| 5 | ✅ Back ×8 on the lock screen ends on the home screen, never the video; reopening the video locks again. "Alexa, open …" can't be tried on the emulator. |
| 6 | ✅ **Closed when the family has a PIN:** the TV's settings and the uninstall screen are grown-ups only (`Allowlist.kindOf`, unit-tested). Opening Settings brings up the PIN pad ("To open the TV's settings") in 1.2 s; the right PIN opens Settings for 10 minutes. Without a PIN they stay open (nobody could unlock them), and a force-stop still stops counting until MarbleTime opens again; no "TV stopped reporting" warning to the parent yet. |
| 7 | ✅ The service starts by itself after a restart and locks, **if** the grants were saved: Android saves app-op changes up to 30 min later, and a restart before that lost both grants. `fire.sh grant` now runs `appops write-settings`. |
| 8 | ✅ With the backend unreachable (a relay switched off; Wi-Fi off and airplane mode don't cut the emulator off from the Mac) the TV counted and locked on its own, and the queued time reached the backend within 5 s of reconnecting. |
| 9 | ✅ **Built (Oct 19):** a kid's bedtime (set on the kid's page) dims them on "Who's watching?" with a moon; when it begins during a show the video locks within a second ("It's bedtime, Leo"), and only the time before it counts. "30 more minutes" with the PIN lets everyone watch again (the remote starts there when nobody can watch). |
| 10 | ✅ Screen off ends the session: 23 s counted of 82 s watched, none of the 40 s dark. |

**On the stick, Oct 19** (the family's own TV switched to strict mode for ten minutes, nobody picked, so no time was counted; then back to Amazon Kids mode): YouTube, Prime Video and Netflix were each behind "Kes vaatab?" 0.6–0.8 s after they opened (row 1). Fire TV's settings (`com.amazon.tv.settings.v2`) and the uninstall dialog (`com.android.packageinstaller`) brought up the PIN pad, "Teleri seadete avamiseks", in 1.4 and 1.1 s (row 6). "Alexa, open YouTube" said into the hardware remote (row 5): YouTube opened about 2 s after the button was let go and was behind "Kes vaatab?" a second later. **Oct 20, filming the demo video** (the made-up family, fast clock): Demo Cartoons opened behind "Who's watching?"; with Mia picked it played, "5 minutes left" and then "1 minute left" showed over the cartoon (row 2), and "Mia's jar is empty" locked it at zero (row 3).

**Emulator setup that worked:** `avdmanager create avd -n marbletime-tv -k "system-images;android-34;google-tv;arm64-v8a" -d tv_1080p`; build with `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a` (the stick's build is 32-bit only); turn off Play Protect's check before `adb install` (`settings put global verifier_verify_adb_installs 0`), or the install waits for a tap; start apps with `am start -n` (`monkey` fails there); the Mac is `10.0.2.2`.

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
| Speaking into the microphone on the character screen opens Alexa's search results | Voice isn't used for characters since Oct 19 (docs/08): the screen asks for typing, or a grown-up types the words in the phone app. The remote's microphone still opens Alexa (the Fire TV phone app's always does; the hardware remote's types only while the keyboard is open, in the stick's language; FRICTION_LOG, Oct 12 and 13) |
| `vega` not found | `source ~/vega/env` (or open a new terminal) |
| Simulator won't start | Check free disk (≥ 20 GB), Rosetta installed; `vega virtual-device start` again |
| TV monorepo won't install | `corepack enable` (it needs Yarn 4) |
| Stick unavailable | Android TV emulator (you have a google-tv image) + the Vega simulator. The FAQ says emulators are acceptable. |
