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

- **Oct 19:** scripted presses still can't reach `onPress` on the VVD with the current SDK (0.24): `KEY_ENTER`, `KEY_SELECT`, `KEY_OK`, `BTN_SELECT`, `KEY_KPENTER`, `touch` and `mouse_click` all fail, and `inputd-cli list_devices` reports "No input devices found". Screens can be checked by test link only.

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
- **Oct 20:** the cause is the hardware decoder, not the view. A `TextureView` alone doesn't help: the frames of the
  hardware VP9 decoder (`OMX.MTK.VIDEO.DECODER.VP9`) stay black in `screencap` and `screenrecord` while the app's own
  text shows. A software decoder does: Demo Cartoons now plays through ExoPlayer with software decoders first
  (`c2.android.vp9.decoder`) into a `TextureView`, and the stick's recordings show the cartoon. Nothing on the device
  or in the docs says that hardware-decoded video is left out of captures.

## 2026-10-05 · A new AWS account can't call any Bedrock model ("Error 002")

- **Task:** generate children's quiz questions with Claude on Amazon Bedrock, from a hackathon project's new AWS account (us-east-1, signed in with `aws login`).
- **Steps:** `bedrock list-foundation-models` and `list-inference-profiles` show the Claude models as ACTIVE → InvokeModel on `us.anthropic.claude-sonnet-5-5` through the official Anthropic Bedrock SDK.
- **Expected:** the call works, or a clear "request access here" step.
- **Actual:** `400 Error 002: Access to Bedrock models is not allowed for this account`, for every model, Amazon's own Nova Micro included. Adding a payment method didn't lift it. Nothing in the console says the account is restricted; per AWS re:Post it's an automatic limit on new accounts with little billing history, lifted only through a support case.
- **Severity:** high for a time-boxed hackathon: the AI part of the project is blocked on a support ticket, and the error doesn't say what to do.
- **Not IAM:** the deployed question writer, calling as its own Lambda IAM role (not root), gets the same `Error 002` on every call (Oct 7, 01:00 UTC nightly run), and so does a fresh test role with AWS's `AmazonBedrockFullAccess` policy (Nova Micro and Claude); a missing permission would be `AccessDeniedException … not authorized to perform bedrock:InvokeModel`.
- **Still blocked on Oct 19**, 14 days after the first try, and on Oct 20: the Converse API gives the same `Error 002` for Nova Micro and Claude Haiku 4.5. With the free (Basic) support plan the CLI can't read support cases either (`SubscriptionRequiredException`), so a case's progress is visible only in the console.
- **Workaround:** a free Support case (Account and billing) asking to enable Bedrock model access; meanwhile the app runs on its built-in question bank.
- **Why the workaround falls short (Oct 14):** the only other model this project can reach, Gemini (Vertex AI or API key), is barred by Google's terms from any app "directed towards or … likely to be accessed by individuals under the age of 18". For a kids' app the block leaves no allowed model for what children trigger at runtime (character making, on-demand puzzles); AWS's terms and Anthropic's Usage Policy do allow products for minors, with conditions (docs/01).
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

## 2026-10-11 · Browsers: a parent web app on the Wi-Fi dev server has no microphone or push
- **Steps:** open the parent PWA on a phone at `http://<mac>:5173` (the dev server on the LAN); record a kid's idea, turn notifications on.
- **Expected:** a way to test both on a real phone without deploying.
- **Actual:** the browser gives `getUserMedia` and Web Push only to secure pages (https or localhost), so both are hidden. We first wrapped the app in an Android WebView (Capacitor): the microphone worked, but a WebView has no `PushManager`, so the Web Push path we already had was dead there and would have needed a second one (FCM). Dropped.
- **Severity:** medium (an hour lost on the WebView detour).
- **Workaround:** `scripts/dev.sh` serves the dev stack over https with an mkcert certificate for the Mac's LAN address; the phone installs mkcert's root certificate once.
- **Suggestion:** none for Amazon; noted because a parent app in the Amazon Appstore as a WebView wrapper would hit the same push gap (ADM, not Web Push).

## 2026-10-12 · Fire TV: the phone app's microphone can't dictate into a text field, and takes the child out of the app

- **Task:** let a kid describe their new character by voice on the TV (Fire TV Stick 4K Plus, AFTMA08C15, Fire OS 8, keyboard `com.amazon.tv.ime` 1.0.2384.0).
- **Steps:** opened a plain text field with the system keyboard; the person at the TV, who drives it with the Fire TV app on a phone, held that app's microphone button and spoke.
- **Expected:** the keyboard's voice typing ("Press and hold (mic) to say words and phrases"), which the keyboard has.
- **Actual:** nothing reached the field. Alexa took the words as a search and opened its results page over our app. The stick's log shows the path: the phone app calls the stick directly (`POST /v1/FireTV/voiceCommand?action=start` → `com.amazon.tv.turnstile`: "Starting voice search"), then the launcher starts `DirectiveSearchResultsActivityDI`. The keyboard's dictation is only started by the system's key handler when the hardware microphone key is pressed (`com.amazon.tv.ime.action.VOICE_INPUT`, "received from FireTVKeyPolicyManager"), and the phone app sends no such key.
- **Also:** with only the phone app in use the keyboard doesn't offer voice typing at all, and logs `IME-FireTVIME: Voice input is disabled since no voice capable remote paired`. The phone app's remote is three software input devices (`amzkeyboard`, `kcmouse`, `amazon_touch`, vendor 0); the keyboard looks for an input device with Amazon's vendor id (0x1949 or 0x171), which a Bluetooth remote has only while it is connected.
- **Our mistake on the way:** we first read `amzkeyboard` as the stick's own remote and concluded the keyboard doesn't know it. It is the phone app. A stand-in input device with vendor 0x1949 (`scripts/fire.sh voice on`, removed on Oct 19 with voice input) makes the microphone hint appear, but the phone app's speech still goes to Alexa.
- **Also closed:** an app can't use the speech service itself (`com.amazon.vizzini.voiceservice.SpeechToTextService` needs the signature|privileged permission `com.amazon.vizzini.SPEECH_RECOGNIZER`), and the remote's microphone isn't an audio input an app can open.
- **Not yet checked:** words typed by voice with the Bluetooth remote in hand (see the next entry for what that remote did).
- **Severity:** medium: a family that uses the phone app as its remote gets no voice typing, a child who speaks into it is thrown out of the app into search results, and nothing on screen or in the developer docs says when voice typing is offered. We found the conditions in the keyboard's log and code.
- **Workaround:** the hardware remote (to be confirmed), typing with the D-pad, or the keyboard's QR code for typing on a phone.
- **Suggestion:** when a keyboard that offers voice typing is on screen, send the phone app's microphone to it, as the hardware key is; document when voice typing is offered; give apps a dictation API (FEATURE_REQUESTS.md).

## 2026-10-12 · Fire TV: the remote's microphone key types only while the keyboard is open; otherwise it leaves the app

- **Task:** the same screen, now with the hardware remote (Amazon Fire TV Remote, vendor 0x171, product 0x42f) in hand.
- **Steps:** our text field was selected (white ring), its keyboard closed so that our own line about where to speak stayed readable; the person held the remote's microphone key and described the character.
- **Expected:** the words in the selected field, or at least nothing happening.
- **Actual:** Alexa took the words as a search and opened the launcher's results page (film tiles) over our app. The stick's log: `Received Key name: ALEXA`, twice, with `top=app.marbletime.tv/.MainActivity`; no line from the keyboard; then `START … com.amazon.tv.launcher/.deeplink.activity.DirectiveSearchResultsActivityDI`.
- **What we learned:** the key reaches the keyboard only while the keyboard is on screen (its own receiver says "Intent sent to the IME even though it's not visible. Rejecting."). A selected text field is not enough.
- **Our part:** we had stopped the keyboard from opening by itself earlier that day, because it covers the middle of the screen.
- **Severity:** medium: a child who does the natural thing (sees a text box, holds the microphone) is thrown out of the app into film search results, and nothing documents the rule.
- **Workaround:** the screen opens the keyboard the moment it appears, and its own line sits in the strip under the keyboard. With the remote connected the keyboard then shows "Press and hold (mic) to say words and phrases" (seen on the stick). Words typed that way: not yet confirmed. The language is the stick's Alexa language, never Estonian.
- **Suggestion:** keep the microphone key in the app whenever one of its text fields is selected; document the rule (FEATURE_REQUESTS.md).

## 2026-10-13 · Fire TV: no way for an app to hear what is said to the remote, and the docs say so in two far-apart places

- **Task:** the same wish, after three tries by the person at the TV ended in Alexa's search results: say a sentence to the remote and have the app receive it.
- **Steps:** read the docs for every route. The Fire TV FAQ and the remote-input page: the microphone button "launches system-wide voice capabilities and cannot be overridden". "Voice-enabling your app": the Video Skills Kit, the Media Session API (play, pause) and in-app voice scrolling and selection. The Video Skills Kit is the only one that hands an app the words (`searchText.transcribed` in `SearchAndDisplayResults`), and its app-only overview opens with "No new partners will be onboarded to Video Skills Kit (VSK)".
- **Expected:** one page that says: this is how free speech reaches an app, or it can't.
- **Actual:** it can't, except through the system keyboard's voice typing, which no developer page describes (when it is offered, that it needs the hardware remote and an open keyboard, which language it hears). We learned each condition from a failed try and the stick's log.
- **Also:** Alexa has no Estonian, so a family that speaks it can't dictate at all; and the Fire TV phone app, which many families use as their only remote, has a large microphone button that never reaches a text field.
- **Our part:** we shipped two workarounds through our own phone app before reading the FAQ line; the founder rejected them ("it should not be through parent app").
- **Severity:** high for a kids' app: children who can't type have no way to give an app a sentence, in any language, from the remote most families hold.
- **Workaround:** the screen opens the keyboard at once and its own line follows the remote in hand: "hold the microphone and say it in English" only while a remote with a microphone is connected, "type it here; to say it, pick up the remote with the microphone" otherwise.
- **Suggestion:** a dictation API for the app in front (FEATURE_REQUESTS.md); until then, one doc page on keyboard voice typing, and the phone app's microphone typing into an open keyboard.

## 2026-10-19 · Testing strict mode on the Android TV emulator: three snags before the first lock

- **Task:** run the strict-mode checklist (docs/06 §6.3) on the Android TV emulator, which the hackathon FAQ accepts for Fire TV, instead of a family's paired stick.
- **Steps:** created a Google TV AVD (Android 14, arm64), installed the TV app and a test video app over ADB, granted usage access and "display over other apps" with `appops set`, ran the checklist, restarted the emulator.
- **Expected:** the same behaviour as the stick, with the same setup commands.
- **Actual:**
  - The second `adb install` hung with no output: Google Play Protect was waiting for someone to tap "Install anyway" on the TV screen.
  - Wi-Fi off and airplane mode don't take the backend away: the emulator still reaches the Mac at `10.0.2.2`, so "no network" can't be simulated from the device.
  - After a restart both grants were gone ("default"), so the lock never fired: Android saves app-op changes up to 30 minutes later, and a restart before that loses them. The same likely applies to a stick unplugged soon after setup [A: seen on the emulator only].
  - On Android 13+ the app's 5- and 1-minute notes (toasts) were hidden ("Suppressing toast … by user request") until the app could post notifications.
- **Severity:** medium: each looks like a bug in the app being tested, and the third one silently turns enforcement off.
- **Workaround:** `settings put global verifier_verify_adb_installs 0` before installing; a TCP relay in front of the backend, switched off to cut the TV off; `appops write-settings` right after granting (now in `scripts/fire.sh grant`); declared and granted `POST_NOTIFICATIONS`.
- **Suggestion:** a Fire TV page on testing with the Android TV emulator (what differs from a stick: launcher and settings package names, no Alexa, Play Protect), and a supported way for a parental-control app to get usage access on Fire TV without ADB.

## 2026-10-19 · Vega: an app's own link scheme can't open it; only `pkg://<component>?query` works

- **Task:** open a test screen in the Vega app with a link, as on Fire OS (`marbletime://open?screen=board`).
- **Steps:** `vlcm launch-app 'marbletime://open?…'` on the Vega Virtual Device; then `vmsgr launch-app`, after `vlcm` printed that it is deprecated.
- **Expected:** the app opens with the link, as Android does for a declared scheme.
- **Actual:** "Failed to launch (-1)". Only `pkg://app.marbletime.tv.main?screen=board` reaches the app, and the rule is written only in a file in the SDK's header folder (`messaging-AddressingSchemes.md`), not in the React Native docs.
- **Severity:** medium: test links, deep links from a phone app and QR codes all need a second form on Vega.
- **Workaround:** the Vega app turns `pkg://…?query` into the shared `marbletime://open?query` (`tv/packages/vega/src/App.tsx`).
- **Suggestion:** a Vega "Linking" page for React Native apps (schemes, `pkg://`, `vmsgr`), and accept an app's declared scheme.

## 2026-10-19 · Vega: a custom font silently falls back to the system font

- **Task:** show the TV's typeface (Fredoka, bundled as TTF) in the Vega build, as the Fire OS build does.
- **Steps:** set `fontFamily: 'Fredoka-SemiBold'` in the shared styles; built and ran on the VVD.
- **Expected:** the font, or an error saying where fonts must go.
- **Actual:** the system font, with no warning. The fonts load only from `<app>/assets/fonts/`, found by trial; the only font docs are for native C++ apps.
- **Severity:** low, but easy to miss on a design review: everything looks almost right.
- **Workaround:** the four TTFs and their OFL licence copied into `tv/packages/vega/assets/fonts/`.
- **Suggestion:** a React Native fonts page for Vega, and a log line when a `fontFamily` isn't found.

## 2026-10-20 · AWS MCP Server: an expired `aws login` shows up as "Invalid request parameters"

- **Task:** use the AWS MCP Server from the coding agent. The AWS CLI set it up for Claude Code on Oct 5, with the AWS
  agent skills: `uvx mcp-proxy-for-aws@latest https://aws-mcp.us-east-1.api.aws/mcp --metadata INSTALL_SOURCE=aws-cli`.
- **Steps:** start an agent session after the short-term `aws login` session has expired (it lasts hours). To see
  what happens, start the same command by hand and send it an MCP `initialize` (protocol 2025-06-18 and 2025-11-25).
- **Expected:** "your AWS sign-in has expired, run `aws login`", or the server starting and asking for a new sign-in
  on the first tool call.
- **Actual:** the server fails to connect. The proxy answers `initialize` with JSON-RPC error `-32602 Invalid request
  parameters` and empty `data`. The cause is only in the proxy's stderr, which the agent never sees:
  `CreateOAuth2Token … The refresh token has expired`, then `LoginRefreshRequired: Your session has expired or
  credentials have changed. Please reauthenticate using 'aws login'`. It failed this way at the start of every
  session since Oct 11, so the agent never had the server's tools. Of the skills, it used `signing-in-to-aws` once.
- **Severity:** medium: the error blames the request, not the sign-in, and with short-term credentials it happens
  whenever a session starts after they expire.
- **Workaround:** `aws login` before starting the agent session. Confirmed the same day: right after `aws login`
  the same `initialize` answers normally ("MCP Proxy for AWS" 1.7.0); a session that is already running reconnects it
  with `/mcp`.
- **Suggestion:** pass the sign-in error through in the `initialize` error (message and `data`), or start without
  credentials and give each tool call that message, so the tools appear as soon as the user signs in again.

## 2026-10-20 · Amazon Devices Builder Tools: a Vega API page comes back as the site's menu

- **Task:** find out how a React Native for Vega app plays its own short sounds (our Vega build is silent) with the
  Builder Tools MCP server (1.0.17), installed for Claude Code that day. Its tools were called through its `exec`
  command, because a running session only connects a new MCP server after a restart.
- **Steps:** `search_documentation` ("play short sound effect audio file in app", platform `vega_os`), then
  `read_document` on the results: `https://developer.amazon.com/docs/vega-api/0.24/README.amazon-devices_react-native-w3cmedia.html`
  and the `AudioPlayer` class page next to it.
- **Expected:** the page's text: how to make an `AudioPlayer` and give it a file.
- **Actual:** both answers are exactly 100,020 characters long and hold only the API reference's navigation menu
  (about 700 links), no page text [A: cut at a fixed length that the menu alone fills]. The first search also
  returned the WebView/WebGL best-practices page four times, once per SDK version (0.21–0.24), ahead of anything
  for React Native.
- **Also:**
  - `exec` output stops at 64 KB when stdout is a pipe (`… | grep`); redirected to a file, the same call gives all
    of it.
  - The curated key reference (`vega_remote_control_buttons.md`) lists `KEY_ENTER` as "DPad Center/Select", but a
    scripted `KEY_ENTER` reaches the app as `enter` and never fires `onPress` (Oct 5 entry). The documented way to
    press buttons from a script is Appium with the Vega driver; a community feature request (topic 29258) and bug
    report (29134) describe it as flaky on the Virtual Device.
- **What helped:** the search found Amazon's key-name reference, the Appium for Vega guide and a forum thread from
  another team with the same problem, and pointed to the right building block for sound (`AudioPlayer` in
  `@amazon-devices/react-native-w3cmedia`). The skills loaded into the running session at once.
- **Severity:** medium: the agent gets an answer that looks like a page but isn't, and has to find the text elsewhere.
- **Workaround:** the npm package's own README and `.d.ts` files (`npm pack @amazon-devices/react-native-w3cmedia`).
- **Suggestion:** drop the navigation before applying the length limit; show a page once with the SDK versions it
  covers; flush `exec` output before exiting; fix the `KEY_ENTER` row or name a key that sends `select`.


## 2026-10-20 · Fire TV: the stick records its own screen at 12 frames a second

- **Task:** record the demo video on the Fire TV Stick 4K Plus (Fire OS 8, Android 11) with `adb shell screenrecord`.
- **Expected:** the 60 fps the TV shows. `dumpsys gfxinfo` says MarbleTime draws 300 frames in 5 s, none late.
- **Actual:** about 12 fps at 1920×1080, and 5–7 fps while a cartoon plays. The video looked jumpy to the user,
  who asked why it wasn't recorded "from the real TV". `scrcpy --list-encoders` shows why: the stick offers apps only
  software encoders (`c2.android.avc.encoder`, `hevc`, `vp8`, `vp9`), so the CPU encodes every frame. The cartoon's
  decoder is software too (Oct 5 entry: the hardware decoder's frames record as black).
- **Measured (scrcpy 4.1, H.264, 6 s of the board):** 1920 wide 13 fps, 1280 21 fps, 1024 35 fps, 960 43 fps, 854 58 fps.
  With the 60 fps Big Buck Bunny stream playing, 1024 gets 20 fps (gaps up to 180 ms). With a 30 fps H.264 copy built
  into Demo Cartoons, 960×540 gets 29 fps.
- **Also:** `scrcpy --audio-source=output` records silence on the stick (−87 dB), and costs a few frames a second.
  In the evening the same 960×540 recording got 22 fps with the cartoon: the stick had 14 MB of its 800 MB swap left
  (the Silk browser and other apps cached in the background). `adb shell am kill-all` brought it back to 28 fps.
- **Severity:** medium: a demo recorded the obvious way looks broken, and nothing says the encoder is software.
- **Workaround:** `scrcpy --max-size=960 --max-fps=30 --no-audio`, a 30 fps source for the video app, sounds added
  afterwards.
- **Suggestion:** say in the Fire TV developer docs what screen recording can do on each stick, and give apps the
  hardware encoder (or a full-rate capture over `adb`) on devices in developer mode.

## 2026-10-20 · Gemini-TTS reads the quoted character description aloud on longer lines

- **Task:** narrate the demo video in Pancake Dragon's own voice: `gemini-2.5-flash-tts`, voice Puck, with the style
  the backend gives the character (`voicePrompt`: `A native English speaker, as "a friendly dragon", a cartoon character
  for young children: …`).
- **Expected:** the sentence, in that voice.
- **Actual:** checked with the backend's own listener, 3 of 9 narration sentences came out wrong. "Lisa tidies her toys
  and tells the TV." began with "A friendly dragon." in 6 takes out of 6. Another sentence lost its first words to it,
  and "That's me." came out twice. The app's own short lines ("Hi Lisa! I'm Pancake Dragon!") were right on the first
  take, and the app checks every line anyway (line-check.ts, up to 6 takes), so kids never heard it.
- **Severity:** low for the app (the check catches it, at the cost of more takes), high for anything that skips the check.
- **Workaround:** for the video, the same style without the quoted `what`; every sentence listened back before use.
- **Suggestion:** a style field the model never speaks. For us: if takes keep failing, try the style without `what`.

## 2026-10-20 · Vertex AI: 429 "Resource exhausted" while listening back to narration

- **Task:** three new narration sentences for the demo video in the dragon's voice (`gemini-2.5-flash-tts`), each take
  listened back with `gemini-3.8-flash` before use, around 21:00 EEST.
- **Expected:** a checked take in a few seconds, as for the 20 sentences before.
- **Actual:** the listening model answered `429 RESOURCE_EXHAUSTED` ("Please try again later"). That sentence went
  through 40 s later. The next one kept failing for about 7 minutes (8 tries, 45 s apart; their errors weren't kept),
  then worked on the first try by hand. The 429 doesn't say which quota ran out or when it frees up.
- **Severity:** low: a batch job that waits and tries again gets through, slowly.
- **Workaround:** the video script waits 45 s between tries. (The backend's own speech client already waits as long as
  Google's Retry-After or RetryInfo asks, when one comes.)
- **Suggestion:** name the quota and give a retry time in every 429.
