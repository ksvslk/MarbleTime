# Friction log

Where Amazon's tools and docs held us up while we built MarbleTime (Oct 5–22, 2026), worst first. Every entry is
something we ran into ourselves. Severity: high blocks a feature, medium costs hours or fails without an error, low is
a nuisance.

### Bedrock: a new AWS account can't call any model · high · Oct 5

- **Task:** draw characters with Claude on Bedrock, from a new AWS account.
- **Steps:** InvokeModel and Converse on Claude and Nova, as root and as an IAM role.
- **Expected vs actual:** a reply; got `Error 002: Access to Bedrock models is not allowed for this account` for every
  model, Oct 5–22. The console doesn't say the account is restricted.
- **Workaround:** a support case, open since Oct 5. Gemini on a local server for the prototype.
- **Suggestion:** say in the error that the account is restricted, and how to lift it.

### Vega: OK doesn't press buttons until the manifest asks for audio services · high · Oct 5

- **Task:** press a button with OK on the Vega Virtual Device, in an app made from the multi-TV starter.
- **Steps:** focus a `Pressable`, press OK.
- **Expected vs actual:** `onPress`; got only `onPressIn`. The click sound fails to bind `com.amazon.audio.system` and
  the key-up is lost. No error points to the manifest.
- **Workaround:** `com.amazon.audio.system` and `com.amazon.audio.control` under `[wants]` in `manifest.toml`. Scripts
  still can't press OK (Oct 19): `KEY_ENTER` arrives as `enter`, and `KEY_SELECT` and `KEY_OK` do nothing.
- **Suggestion:** put both services in the starter's manifest, and don't let a failed click sound eat the key-up.

### Fire TV: an app can't get the words said to the remote · high · Oct 12–13

- **Task:** let a kid who can't type describe a new character by voice.
- **Steps:** a text field with the system keyboard; hold the microphone on the remote, then on the Fire TV phone app.
- **Expected vs actual:** the words in the field; got Alexa's search results over our app. The keyboard offers voice
  typing only while it's on screen with a hardware remote connected, and the phone app's microphone never reaches it.
- **Workaround:** none. Kids type, or a grown-up types in our phone app.
- **Suggestion:** a dictation API for the app in front ([FEATURE_REQUESTS.md](FEATURE_REQUESTS.md)). Until then, a doc
  page on keyboard voice typing.

### Amazon Kids on Fire TV isn't offered in Estonia · high · Oct 5

- **Task:** test our Amazon Kids mode on a Fire TV Stick registered in Estonia.
- **Steps:** Settings → Account & Profile Settings → Add Profile.
- **Expected vs actual:** a kids profile, as in the docs; got none. Nothing says which countries have it.
- **Workaround:** the mode is built to the docs, untested.
- **Suggestion:** list the countries in the docs, and let developers try Amazon Kids anywhere.

### Vega: the Release build aborts at start · medium · Oct 20

- **Task:** a Release build of the Vega app for the judges.
- **Steps:** `react-native build-kepler --build-type Release`, then `vega run-app` on the Virtual Device.
- **Expected vs actual:** the app starts, as the Debug build does; got `signal 6` 30 ms after start, no JavaScript error
  in the log, and a crash report the developer shell can't read. We never found the cause, which may be in our code.
- **Workaround:** the judges get the Debug packages.
- **Suggestion:** log the JavaScript error before aborting, and let developers read their app's crash reports.

### Multi-TV starter: release builds keep old shared code · medium · Oct 5

- **Task:** change a screen in `packages/shared` and build the Fire OS release APK.
- **Steps:** `./gradlew assembleRelease`.
- **Expected vs actual:** the new screen; got yesterday's, with no warning. The JS bundle task doesn't count
  `packages/shared` as an input.
- **Workaround:** `--rerun` on the bundle task (in `scripts/fire.sh build`).
- **Suggestion:** add `packages/shared` to the bundle task's inputs in the starter.

### Multi-TV starter: pins an exact Vega SDK patch version · medium · Oct 5

- **Task:** build the starter for Vega right after installing the SDK.
- **Steps:** install the latest SDK (0.24.12112), then `yarn vega:build`.
- **Expected vs actual:** a build; got `SDK version main@0.24.9914 is not installed` from every `vega` command in the
  repo, `--help` included.
- **Workaround:** change `vegaSdkVersion` in `vega-sdk-requirements.json`.
- **Suggestion:** accept compatible patch versions, and name the file in the error.

### Fire OS: the default text-to-speech engine has no voices for apps · medium · Oct 5

- **Task:** read questions aloud for kids who can't read, on a Fire TV Stick 4K Plus.
- **Steps:** Android's `TextToSpeech`, default engine, English.
- **Expected vs actual:** speech; got `LANG_NOT_SUPPORTED` from the default engine (IVONA), and every `speak` fails.
- **Workaround:** ask for the Pico engine by name, with a `<queries>` entry for `TTS_SERVICE` in the manifest.
- **Suggestion:** give apps the IVONA voices, or document the Pico route.

### Vega: no simple player for an app's own short sounds · medium · Oct 5

- **Task:** play our own short sounds on Vega, as SoundPool does on Fire OS.
- **Steps:** the docs send short sounds to `com.amazon.audio.system`; we installed
  `@amazon-devices/keplerscript-audio-lib`.
- **Expected vs actual:** load a bundled file and play it; got only system sounds and raw PCM streams. The W3C media
  player can play files, but it's built for media playback, and we haven't tried it for effects.
- **Workaround:** none yet. The Vega build has no sound.
- **Suggestion:** a SoundPool-like API, with an example for bundled files.

### Vega: an app's own link scheme can't open it · medium · Oct 19

- **Task:** open a test screen with a link, as on Fire OS (`marbletime://open?screen=board`).
- **Steps:** `vmsgr launch-app 'marbletime://open?…'` on the Virtual Device.
- **Expected vs actual:** the app on that screen; got `Failed to launch (-1)`. Only
  `pkg://app.marbletime.tv.main?screen=board` works, a rule written only in a file in the SDK's header folder.
- **Workaround:** the app turns `pkg://…?query` into its own link.
- **Suggestion:** accept the app's declared scheme, and add a linking page to the React Native for Vega docs.

### Vega Virtual Device: no screenshot command · medium · Oct 6

- **Task:** check a screen from a script, as `adb exec-out screencap` does on Fire OS.
- **Steps:** looked in `vega device`; ran `screenshooter` through `vega exec vda shell`.
- **Expected vs actual:** a PNG; got `Permission denied` from `screenshooter`, and `vega device` has no screenshot
  command.
- **Workaround:** capture the simulator's Mac window by its id (`scripts/vega.sh shot`).
- **Suggestion:** `vega device screenshot -o file.png`.

### Fire TV: screen captures leave out video and record at 12 fps · medium · Oct 5, Oct 20

- **Task:** record the demo video on the stick, with a cartoon playing.
- **Steps:** `adb shell screencap` and `screenrecord`.
- **Expected vs actual:** what the TV shows, at 60 fps; got black where the video plays, and about 12 fps at 1080p,
  because apps get only software encoders.
- **Workaround:** software decoding in our test video app; scrcpy at 960×540 and 30 fps.
- **Suggestion:** document what capture can do on each stick, and open the hardware encoder in developer mode.

### AWS MCP Server: an expired sign-in shows up as "Invalid request parameters" · medium · Oct 20

- **Task:** use the AWS MCP Server from Claude Code, as the AWS CLI set it up.
- **Steps:** start a session after the `aws login` session has expired.
- **Expected vs actual:** "run `aws login`"; got `-32602 Invalid request parameters`, with the real message only in
  the proxy's log. The agent never had the server's tools.
- **Workaround:** `aws login` before starting the agent.
- **Suggestion:** pass the sign-in error through, or start anyway and give that message on each tool call.

### Amazon Devices Builder Tools: a Vega API page comes back as the site's menu · medium · Oct 20

- **Task:** find how a React Native for Vega app plays short sounds, with the Builder Tools MCP server.
- **Steps:** `search_documentation`, then `read_document` on the `react-native-w3cmedia` API page.
- **Expected vs actual:** the page's text; got 100,020 characters of navigation menu. Search lists each page once per
  SDK version. The key reference calls `KEY_ENTER` Select, but a scripted `KEY_ENTER` doesn't press buttons.
- **Workaround:** the npm package's README and type files.
- **Suggestion:** drop the menu before cutting a page to length, list each page once, and fix the `KEY_ENTER` row.

### Vega: a custom font falls back to the system font without a warning · low · Oct 19

- **Task:** use our typeface (Fredoka) in the Vega build.
- **Steps:** `fontFamily: 'Fredoka-SemiBold'` in the shared styles.
- **Expected vs actual:** the font, or an error; got the system font. Fonts load only from `<app>/assets/fonts/`,
  found by trial.
- **Workaround:** the fonts copied there.
- **Suggestion:** a fonts page for React Native on Vega, and a log line when a font isn't found.

### CDK: `HttpLambdaIntegration` adds one Lambda permission per route · low · Oct 5

- **Task:** one Lambda behind an HTTP API with 29 routes.
- **Steps:** one `HttpLambdaIntegration` shared by every route.
- **Expected vs actual:** one invoke permission; got 29, which grows the function's policy toward its 20 KB limit.
- **Workaround:** `scopePermissionToRoute: false`.
- **Suggestion:** one API-wide permission by default for a shared integration.
