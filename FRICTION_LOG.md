# Friction log

One entry per real snag with an Amazon tool or doc: task · steps · expected vs actual · severity · workaround · suggestion.

## 2026-10-05 · Vega SDK installer output when run unattended

- **Task:** install the Vega SDK 0.24 and the Vega Virtual Device on an Apple Silicon Mac, driven by a coding agent.
- **Steps:** `NONINTERACTIVE=true bash get_vvm.sh > install.log 2>&1` (the installer script from `sdk-installer.vega.labcollab.net`).
- **Expected:** a short log with one line per step.
- **Actual:** the install worked (SDK 0.24.12112, CLI 1.4.2), but the progress bars redraw with carriage returns, so the captured log was **2.5 MB** and the result lines were buried. `NONINTERACTIVE` is only discoverable by reading the script.
- **Severity:** low.
- **Workaround:** `tr '\r' '\n' < install.log | grep -v '\['` to read it.
- **Suggestion:** disable progress bars when stdout isn't a TTY or when `NONINTERACTIVE=true`, and document `NONINTERACTIVE` / `SKIP_SDK_INSTALL` / `VEGA_SDK_VERSION` in the install guide.

## 2026-10-05 · The multi-TV starter pins an exact Vega SDK patch version

- **Task:** build `AmazonAppDev/react-native-multi-tv-helloworld` for the Vega Virtual Device right after installing the SDK.
- **Steps:** install the SDK with the official installer (it installs the latest, 0.24.12112) → `yarn vega:build` in the starter.
- **Expected:** the build uses the installed 0.24 SDK.
- **Actual:** the starter's `vega-sdk-requirements.json` pins `0.24.9914`. Metro bundling succeeds, then the native step fails: `SDK availability check — SDK version main@0.24.9914 is not installed`. Every `vega` command run inside the repo fails the same way, even `vega virtual-device --help`.
- **Severity:** medium (blocks the first build; the message doesn't say where the version comes from).
- **Workaround:** set `vegaSdkVersion` to `0.24.12112` in `vega-sdk-requirements.json`. Build, install and launch then work.
- **Suggestion:** accept compatible patch versions (a semver range), name the file the requirement came from in the error, and let help commands run without the check.

## 2026-10-05 · Text-to-speech on Fire OS 8: the default engine has no voices for apps

- **Task:** read a short question out loud from our app on a Fire TV Stick 4K Plus (Fire OS 8.1.8.2, API 30), for kids who can't read yet.
- **Steps:** `new TextToSpeech(context, listener)` → `setLanguage(en-GB or en-US)` → `speak(…)`.
- **Expected:** the system voice reads the text, as on other Android devices.
- **Actual:** the default engine, IVONA (`com.ivona.tts.oem`), initialises but reports `LANG_NOT_SUPPORTED` for en-GB and en-US, lists 0 voices, and every `speak` ends in `onError`. The Pico engine on the stick works, but it's invisible to apps that target API 30 unless the manifest declares `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/></intent></queries>`, and it has to be requested by name.
- **Severity:** medium (silent failure; there's nothing about it in the Fire TV docs we found).
- **Workaround:** the `<queries>` entry + `new TextToSpeech(context, listener, "com.svox.pico")`.
- **Suggestion:** expose the IVONA (Alexa-quality) voices to third-party apps, or document the Pico workaround in the Fire TV accessibility/TTS docs.

## 2026-10-05 · Release builds of the multi-TV starter keep stale shared code

- **Task:** change a component in `packages/shared` and rebuild the Fire OS release APK (`./gradlew assembleRelease` in `packages/expotv/android`).
- **Expected:** the APK contains the edited code.
- **Actual:** Gradle reports the JS bundle task up to date and reuses the old bundle; the APK still has yesterday's UI. The bundle task's inputs don't include the sibling workspace package, so edits there never invalidate it. No error, no warning.
- **Severity:** medium (silent; easy to "verify" an old build on the device).
- **Workaround:** `./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease` (wrapped in `scripts/fire.sh build`).
- **Suggestion:** have the starter's Expo TV build declare `packages/shared` as a bundle input (or document the `--rerun` step next to the release-build instructions).

## 2026-10-05 · `vda` stops working when a Fire TV stick is also connected

- **Task:** send remote keys to the Vega Virtual Device while a Fire TV stick is connected over Wi-Fi ADB (the normal setup for an app that ships on both Fire OS and Vega).
- **Steps:** `vega exec vda shell "inputd-cli button_press KEY_ENTER"`.
- **Expected:** the key goes to the Virtual Device (the only Vega device).
- **Actual:** `vda: more than one device/emulator`. `vda` lists the Fire TV stick too, and `vega exec vda` doesn't pick the Vega device the way `vega run-app -d VirtualDevice` does.
- **Severity:** low.
- **Workaround:** `vega exec vda -s emulator-5554 shell …` (now in `scripts/vega.sh`).
- **Suggestion:** have `vda` ignore non-Vega devices by default, or let `vega exec vda` take `-d VirtualDevice` like the other commands.

## 2026-10-05 · OK on the remote never reaches `onPress` until the app asks for the audio services

- **Task:** press a button (`TouchableOpacity`, `Pressable`) with OK on the Vega Virtual Device, in an app made from the multi-TV starter.
- **Steps:** focus the button with the D-pad, press OK on the on-screen remote, or `inputd-cli button_press KEY_ENTER`.
- **Expected:** `onPressIn`, `onPressOut`, `onPress`, with the system's click sound.
- **Actual:** only `onPressIn` fires; nothing happens. The system log shows the key-down as `Consumed key:Return`, then on key-up the click sound fails (`UISoundManager … IPC link unsuccessful`, `com.amazon.audio.system … Failed to bind to service`) and the key-up is never consumed, so there is no `onPressOut` or `onPress`. Arrow keys and focus work, so it looks like a broken app, not a missing permission. A plain `TouchableOpacity` and a `Pressable` behave the same.
- **Cause:** the starter's `manifest.toml` has no `[wants]` for `com.amazon.audio.system` and `com.amazon.audio.control`, which the system click on OK needs.
- **Severity:** high: no button works, and nothing in the error points to the manifest.
- **Workaround:** add both services under `[wants]` (done in `tv/packages/vega/manifest.toml`). Key-down and key-up then both reach the app. A scripted `KEY_ENTER` arrives as `enter`, not `select`, so it still gives only `onPressIn`/`onPressOut`; `KEY_SELECT` and `KEY_OK` don't map at all, so scripts can't press buttons.
- **Suggestion:** don't let a failed click sound swallow the key-up; put the two services in the starter's manifest; log a clear "missing manifest service" error; document the `inputd-cli` key names, including one that sends `select`.

## 2026-10-05 · CDK: `HttpLambdaIntegration` adds one Lambda permission per route

- **Task:** one Lambda behind an HTTP API with 29 routes (aws-cdk-lib 2.272.0).
- **Steps:** `new HttpLambdaIntegration('Api', fn)` reused for every `httpApi.addRoutes(...)`.
- **Expected:** one invoke permission for the API.
- **Actual:** 29 `AWS::Lambda::Permission` resources, one per route, which grows the function's resource policy toward its 20 KB limit as routes are added.
- **Severity:** low (fine at 29 routes, a cliff later).
- **Workaround:** `scopePermissionToRoute: false` gives one API-wide permission.
- **Suggestion:** make the API-wide permission the default when one integration is shared, or warn near the policy limit.

## 2026-10-05 · Cognito managed login (v2) shows an empty page without a branding resource

- **Task:** a Cognito hosted sign-in page for the parent web app, from CDK.
- **Steps:** user pool + app client + a managed-login domain (version 2).
- **Expected:** a default sign-in page.
- **Actual:** the v2 managed login needs a `ManagedLoginBranding` resource per app client; without it the page is empty.
- **Severity:** medium (silent: deploy succeeds, sign-in is broken).
- **Workaround:** add a `CfnManagedLoginBranding` with `useCognitoProvidedValues: true` for the client.
- **Suggestion:** create default branding automatically, or fail the deploy with a clear message.

## 2026-10-05 · `npm audit` flags aws-cdk-lib's bundled `brace-expansion` as high

- **Task:** a clean dependency audit for the backend.
- **Steps:** `npm install aws-cdk-lib@2.272.0` → `npm audit`.
- **Expected:** no high findings from the CDK itself.
- **Actual:** a high-severity `brace-expansion` advisory inside aws-cdk-lib's bundled dependencies, which users can't update. It only runs at synth time and isn't in the Lambda bundle.
- **Severity:** low (noise, but it fails "no high vulnerabilities" checks).
- **Suggestion:** refresh the bundled dependency, or mark it as not affecting runtime.

## 2026-10-05 · Amazon Kids on Fire TV isn't offered in Estonia, so the hand-off can't be tested

- **Task:** test MarbleTime's Amazon Kids mode (a kids profile with a daily limit, bonus time from the Parent Dashboard) on a Fire TV Stick 4K Plus bought and registered in Estonia.
- **Steps:** Settings → Account & Profile Settings → Add Profile; the Amazon Kids app (`com.amazon.tahoe`) is installed.
- **Expected:** a "kids profile" option, as in Amazon's docs.
- **Actual:** no kids-profile option and no Amazon Kids entry anywhere (Fire OS 8.1.8.2). Public reports say Amazon Kids on Fire TV is offered only in a few countries; the docs don't say which, and nothing on the device explains it.
- **Severity:** high for a family app in an international hackathon: the platform's own parental-control path, which our design builds on, can't be tried outside those countries.
- **Workaround:** strict mode (sideload) for our own tests; Amazon Kids mode is built to the docs and untested.
- **Suggestion:** list the countries in the Amazon Kids and Fire TV developer docs; a developer/test switch (or a VVD profile) to try Amazon Kids anywhere.

## 2026-10-05 · `am start -W` hangs while the Fire TV screensaver is on

- **Task:** open our app on the stick from a script (`adb shell am start -W -d marbletime://…`) for automated checks.
- **Steps:** leave the stick idle ~5 min (the screensaver starts: wakefulness `Dreaming`), then `am start -W …`.
- **Expected:** the screensaver ends and the activity starts, as when a person presses a key.
- **Actual:** `am start -W` never returns (our script hit its 10-minute timeout); the intent waits behind the dream.
- **Severity:** medium for CI-style testing on Fire TV.
- **Workaround:** `adb shell input keyevent KEYCODE_WAKEUP` first, and no `-W` (in `scripts/fire.sh open`).
- **Suggestion:** end the dream for `am start` from ADB, or document the wake-up step in the Fire TV ADB guide.

## 2026-10-05 · Vega has no simple player for an app's own short sounds

- **Task:** play our own sound effects (MP3 clinks, a "yay", ~0.1–1.5 s) and read-aloud clips in the Vega build, as SoundPool does on Fire OS.
- **Steps:** the docs point brief, low-latency sounds at `com.amazon.audio.system` ("SoundPlayer or SystemSound APIs"); installed `@amazon-devices/keplerscript-audio-lib` 2.0.18 to find them.
- **Expected:** a small API: load a bundled file, play it (several at once), set the volume.
- **Actual:** the library offers only built-in system sounds (`playSystemSoundAsync`) and raw PCM streams (`AudioPlaybackStream`); the README page has no SoundPlayer details. App sound files need the W3C media player (`react-native-w3cmedia`), which is built for media playback, not overlapping effects.
- **Severity:** medium (every game-like app needs this).
- **Workaround:** pending: W3C media `AudioPlayer` per sound (M3).
- **Suggestion:** a SoundPool-like API in the audio library, with an example for bundled assets.

## 2026-10-05 · Screenshots of a video app on Fire TV are black

- **Task:** check from a script that our test video app (Demo Cartoons) really plays on the stick.
- **Steps:** `adb exec-out screencap -p` and `adb shell screenrecord` while the video plays.
- **Expected:** the video frame in the image.
- **Actual:** a black screen (the hardware video layer isn't captured), so playback can only be checked through `dumpsys audio` / `dumpsys media.player` states.
- **Severity:** low.
- **Workaround:** check the player state in `dumpsys`; verify by eye on the TV.
- **Suggestion:** a developer option to include video layers in screen captures of non-DRM content.
