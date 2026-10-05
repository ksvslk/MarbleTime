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
