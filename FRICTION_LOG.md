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

## 2026-10-05 · A new AWS account can't call any Bedrock model ("Error 002")

- **Task:** generate children's quiz questions with Claude on Amazon Bedrock, from a hackathon project's new AWS account (us-east-1, signed in with `aws login`).
- **Steps:** `bedrock list-foundation-models` and `list-inference-profiles` show the Claude models as ACTIVE → InvokeModel on `us.anthropic.claude-sonnet-5-5` through the official Anthropic Bedrock SDK.
- **Expected:** the call works, or a clear "request access here" step.
- **Actual:** `400 Error 002: Access to Bedrock models is not allowed for this account`, for every model, Amazon's own Nova Micro included. Adding a payment method didn't lift it. Nothing in the console says the account is restricted; per AWS re:Post it's an automatic limit on new accounts with little billing history, lifted only through a support case.
- **Severity:** high for a time-boxed hackathon: the AI part of the project is blocked on a support ticket, and the error doesn't say what to do.
- **Not IAM:** the deployed question writer, calling as its own Lambda IAM role (not root), gets the same `Error 002` on every call (Oct 7, 01:00 UTC nightly run), and so does a fresh test role with AWS's `AmazonBedrockFullAccess` policy (Nova Micro and Claude); a missing permission would be `AccessDeniedException … not authorized to perform bedrock:InvokeModel`.
- **Workaround:** a free Support case (Account and billing) asking to enable Bedrock model access; meanwhile the app runs on its built-in question bank.
- **Suggestion:** say in the error (and on the Bedrock console) that the account is restricted and link the request form; let hackathon participants skip the wait.

## 2026-10-06 · No command-line screenshot of the Vega Virtual Device

- **Task:** check a new TV screen on the Vega Virtual Device from a script, as we do on Fire OS with `adb exec-out screencap`.
- **Steps:** looked for a screenshot command in `vega`, `vega virtual-device` and `vega device` (none); ran the on-device `screenshooter /tmp/x.png` through `vega exec vda shell`; fell back to capturing the VVD's macOS window.
- **Expected:** one command that saves a PNG of the device screen.
- **Actual:** `screenshooter` fails as the shell user (`creating a buffer file for 8294400 B failed: Permission denied`), and the window capture only works while the VVD window is on the current desktop (`could not create image from window` otherwise).
- **Severity:** medium (every automated UI check on Vega needs the window on screen).
- **Workaround:** keep the VVD window visible and capture it by window id (`scripts/vega.sh shot`).
- **Suggestion:** `vega device screenshot -o file.png`, working for the virtual device and for devices in developer mode.


## 2026-10-07 · Vega: react-native-svg needs a hand-made alias, and its npm tags are unclear

- **Task:** draw kids' characters with react-native-svg in shared code that both the Fire OS and the Vega build bundle.
- **Steps:** add `@amazon-devices/react-native-svg` to the Vega app; import `react-native-svg` in the shared package.
- **Expected:** the Vega module resolver preset maps the community name to Amazon's port, as it does for some libraries.
- **Actual:** it doesn't for SVG (nor for Lottie), so shared code only resolves with a `metro.config.js` alias per library. On npm, `latest` (3.0.9000000001) sits next to `rn83-alpha` (3.0.9000000000-rn-83) and `rn83-alpha-old`, with no note on which matches React Native 0.83.
- **Severity:** low.
- **Workaround:** a metro `extraNodeModules` alias (like the template's Lottie one) and `latest`, whose version string says `+15.11.1`.
- **Suggestion:** list the community package names the preset maps, and a "which version for which RN" table in the Vega library docs.

## 2026-10-07 · Amazon Transcribe streaming takes raw PCM, not WAV

- **Task:** turn a kid's spoken idea (recorded on the parent's phone) into text with Transcribe streaming, en-US.
- **Steps:** the contract said the browser sends a 16 kHz mono 16-bit WAV, "which Transcribe streaming takes as it is".
- **Expected:** a WAV is fine, as it is for batch jobs.
- **Actual:** the streaming docs say the PCM media encoding is "PCM signed 16-bit little-endian audio (note that this does not include WAV)"; the header has to be stripped. Easy to miss, because batch transcription accepts WAV files.
- **Severity:** low (caught in review, before any code ran against AWS).
- **Workaround:** the backend checks the WAV header and sends only the samples.
- **Suggestion:** accept a WAV header in streaming, or flag the difference from batch more prominently.

## 2026-10-07 · Polly CLI: a list option swallows the output file

- **Task:** make test lines with viseme speech marks for the TV characters: `aws polly synthesize-speech ... --output-format json --speech-mark-types viseme marks.json`.
- **Expected:** marks written to `marks.json`.
- **Actual:** `the following arguments are required: outfile`: `--speech-mark-types` takes a list, so it also took `marks.json` as a second mark type.
- **Severity:** low.
- **Workaround:** put `--speech-mark-types viseme` before another option, with the output file last.
- **Suggestion:** the CLI help example for speech marks could show this order.

## 2026-10-07 · An S3 presigned URL can't outlive the Lambda credentials that signed it

- **Task:** give the TV a link to a cached Polly MP3 that works for at least a day (our API contract), from the API Lambda.
- **Steps:** `getSignedUrl(s3, new GetObjectCommand(…), {expiresIn: 2 * 86400})` with the Lambda's role credentials.
- **Expected:** a link valid for 48 hours (the presigner accepts up to 7 days).
- **Actual:** a presigned URL stops working when the session that signed it expires; a Lambda role's session lasts hours, so `expiresIn` beyond that is silently meaningless. The S3 user guide says so; the SDK presigner, where the expiry is set, accepts the value without a word.
- **Severity:** medium (links break hours later, with nothing at signing time to say why).
- **Workaround:** CloudFront signed URLs: the bucket stays private behind a distribution with origin access control; a custom resource makes the key pair once (private key in SSM Parameter Store, public key in a CloudFront key group).
- **Suggestion:** have the presigner warn (or cap `expiresIn`) when the credentials expire before the URL would, and say so in its docs.

## 2026-10-07 · Polly: no length for an MP3, and lip-sync marks need a second request

- **Task:** a cartoon character says a short line on the TV with its mouth in sync: the MP3, its length and the viseme marks.
- **Steps:** `SynthesizeSpeech` with `OutputFormat: mp3`, then the same text again with `OutputFormat: json`, `SpeechMarkTypes: ['viseme']`.
- **Expected:** the audio's length with the audio, and a way to get audio and marks in one request.
- **Actual:** audio and speech marks are separate requests (two round trips for each line), and the MP3 answer carries no duration, so we read it from the MP3's frame headers (Polly's neural MP3 is MPEG-2 layer III, 24 kHz, 48 kbit/s; our count matches ffprobe to the millisecond).
- **Severity:** low.
- **Workaround:** both requests in parallel, and a short MP3 frame-header parser.
- **Suggestion:** return the duration (a response header would do) and let one request return the audio with its speech marks.

## 2026-10-07 · CDK `NodejsFunction`: a native module for Lambda from a Mac, without Docker

- **Task:** bundle `@napi-rs/canvas` (Skia, a prebuilt native binary) into an arm64 Lambda with `NodejsFunction`, synthesised on an Apple Silicon Mac without Docker.
- **Steps:** `bundling.nodeModules: ['@napi-rs/canvas']`.
- **Expected:** a documented way to install the binary for the function's platform (Linux arm64, glibc).
- **Actual:** the local install brings the macOS binary, which Lambda can't load; the docs only point to Docker bundling. Setting `bundling.environment` to `npm_config_os=linux`, `npm_config_cpu=arm64`, `npm_config_libc=glibc` installs the right one, but npm still adds the musl build too (26 MB more in the bundle).
- **Severity:** low (silent until the function runs).
- **Workaround:** those `npm_config_*` settings, plus an `afterBundling` hook that deletes the musl package.
- **Suggestion:** a target-platform option for `nodeModules` (from `architecture` and the runtime), or a documented recipe for prebuilt native modules.
