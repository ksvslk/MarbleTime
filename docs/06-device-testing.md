# 06 · Testing on a Fire TV Stick (and the Vega Virtual Device)

| Device | OS | Used for |
|---|---|---|
| **Fire TV Stick 4K Plus** | **Fire OS 8** (Android 11 / API 30, 32-bit) | Everything: the core app, Amazon Kids mode, strict mode |
| **Vega Virtual Device** (on a Mac) | Vega OS | The same app on Vega |
| **Android TV emulator** (Google TV image) | Android 14 | Strict mode's checks with a sample family |

> The Fire TV Stick 4K Select, HD (2026) and 4K 3rd Gen (2026) run Vega and can't sideload APKs. To check a stick:
> Settings → My Fire TV → About → Software Version says "Fire OS 8.x".

## 1. ADB setup (about 10 minutes)

1. **On the TV:** Settings → **My Fire TV → About**. Highlight the device name and press **Select 7 times**.
2. Back → **Developer options** → **ADB debugging: ON**. "Apps from unknown sources" can stay off; ADB installs don't
   need it.
3. Settings → My Fire TV → About → **Network**: note the **IP address**, and reserve it in the router.
4. **On the computer:** `adb connect <TV-IP>:5555`.
5. **On the TV:** at *"Allow USB debugging?"*, tick **Always allow from this computer** → OK.
6. `adb devices` shows `<TV-IP>:5555  device`. The scripts read the address from `.env.local` (`FIRETV=<TV-IP>:5555`).
7. **While developing:** Settings → Display & Sounds → Screensaver → start time *Never*. Fire OS 8 also asks "Are you
   still watching?" after 4 hours without input.

## 2. Strict mode: install and permissions

```bash
scripts/fire.sh install                    # build + adb install -r
scripts/fire.sh grant app.marbletime.tv    # the one-time grants below; again after every uninstall or force-stop
scripts/fire.sh launch
```

Fire OS has no settings screen for these permissions, so `grant` sets them over ADB:

```bash
PKG=app.marbletime.tv
adb shell appops set $PKG GET_USAGE_STATS allow                   # which app is in front, for how long
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow               # the lock screen over other apps
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS     # Android 13+ only: the 5- and 1-minute notes
adb shell appops write-settings                                    # save the grants now (Android may wait 30 min)
adb shell dumpsys deviceidle whitelist +$PKG                       # keep the service running
```

To see a jar run out in seconds, turn on the demo clock (a second counts as a minute):
`adb shell am start -a android.intent.action.VIEW -d 'marbletime://open?fast=1' app.marbletime.tv` (`fast=0` turns it
off).

## 3. Vega Virtual Device

It needs at least 20 GB of free disk. From Amazon's Vega SDK 0.24 install guide:

```bash
[[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license
brew update && brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
vega --version
```

Then `source ~/vega/env && scripts/vega.sh build && scripts/vega.sh start && scripts/vega.sh run`. For screenshots of
the simulator window (`scripts/vega.sh shot`), allow **Screen Recording** for the terminal app (System Settings →
Privacy & Security); the Vega CLI can't screenshot the simulator. Amazon Kids profiles aren't available on the
simulator, so Amazon Kids mode is shown on a stick.

## 4. Strict mode's checks

| # | Scenario | Expected |
|---|---|---|
| 1 | Open YouTube or Demo Cartoons | "Who's watching?", then the picked kid's time counts down. Home, Settings and MarbleTime don't count. |
| 2 | 5 and 1 minutes left | A note over the running app |
| 3 | The jar runs out | Lock screen within 2 s; the video stops |
| 4 | A grown-up approves a job while locked | Unlocks by itself, with the new minutes |
| 5 | Home and reopen, Back many times, "Alexa, open YouTube" | The lock comes back every time |
| 6 | The TV's settings or the uninstall screen | Behind the grown-ups' PIN |
| 7 | Restart the stick | Counting starts again by itself |
| 8 | Backend unreachable while watching | Counting and locking still work; the time syncs later |
| 9 | Bedtime | Locked whatever is left in the jar; "30 more minutes" with the PIN |
| 10 | Screen off | No time counted |

**On the Android TV emulator** (Google TV image, Android 14; a sample family on a throwaway backend; demo clock):

| # | Result |
|---|---|
| 1 | ✅ "Who's watching?" 1.2 s after the video app opened. Google TV's home and settings stay free. |
| 2 | ✅ "5 minutes left" and "1 minute left" over the video. Android 13+ shows them only when the app may post notifications (`fire.sh grant` grants it). |
| 3 | ✅ Locked at the right second (50 and 70 minute jars). The picker then showed the jar's old minutes for up to 20 s; fixed: the kid shows 0 minutes about a second after the lock. |
| 4 | ✅ An approval reached the locked TV within 6 s, and the kid could watch again. A bug found here is fixed: an emptied kid now drops out of the picked ones, so a sibling with time can watch. |
| 5 | ✅ Back ×8 on the lock screen ends on the home screen, never the video; reopening the video locks again. |
| 6 | ✅ With a family PIN, opening Settings brings up the PIN pad in 1.2 s; the right PIN opens Settings for 10 minutes. Without a PIN they stay open. |
| 7 | ✅ The service starts by itself after a restart and locks, once the grants are saved (`appops write-settings`). |
| 8 | ✅ With the backend unreachable, the TV counted and locked on its own, and the queued time reached the backend within 5 s of reconnecting. |
| 9 | ✅ A kid's bedtime dims them on "Who's watching?" with a moon; when it begins during a show, the video locks within a second, and only the time before it counts. |
| 10 | ✅ Screen off ends the session: 23 s counted of 82 s watched, none of the 40 s dark. |

**On a Fire TV Stick 4K Plus:** YouTube, Prime Video and Netflix were each behind "Who's watching?" 0.6–0.8 s after
they opened (row 1). Fire TV's settings and the uninstall dialog brought up the PIN pad in 1.4 and 1.1 s (row 6).
"Alexa, open YouTube" said into the remote opened YouTube about 2 s after the button was let go, and it was behind
"Who's watching?" a second later (row 5). With the demo clock, Demo Cartoons showed "5 minutes left" and "1 minute
left" over the cartoon (row 2) and locked at zero (row 3). Two bugs found on the stick are fixed and unit-tested:
Amazon's own parental-controls PIN screen was counted like a video app, and a TV paired to a different family
celebrated that family's past bonuses and characters as new.

**Emulator setup:** `avdmanager create avd -n marbletime-tv -k "system-images;android-34;google-tv;arm64-v8a" -d tv_1080p`;
build with `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a` (the stick's build is 32-bit only); turn off Play
Protect's check before `adb install` (`settings put global verifier_verify_adb_installs 0`); start apps with
`am start -n`; the host computer is `10.0.2.2`.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `adb connect` fails | Same Wi-Fi? ADB debugging still on? IP changed? Then `adb kill-server && adb connect <ip>:5555` |
| `unauthorized` | Accept the prompt on the TV, or turn ADB debugging off and on |
| Developer options gone after a Fire OS update | Repeat the 7 presses |
| Strict mode stopped after a reinstall or force-stop | `scripts/fire.sh grant` |
| The remote's microphone opens Alexa's search on the character screen | Kids type their character's description, or a grown-up types it in the phone app; the microphone always goes to Alexa ([FRICTION_LOG](../FRICTION_LOG.md), Oct 12 and 13) |
| `vega` not found | `source ~/vega/env` (or open a new terminal) |
| The simulator won't start | Check free disk (20 GB or more) and Rosetta; `vega virtual-device start` again |
| The TV monorepo won't install | `corepack enable` (it needs Yarn 4) |
