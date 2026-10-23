# Friction log

Where Amazon's tools and docs held us up while we built MarbleTime (Oct 2–23, 2026), worst first. The first part is
what I ran into myself as the developer, the second what our coding agent ran into. Every entry happened to us in a
run, a build or a log. Severity: high blocks a feature, medium costs hours or fails without an error, low slows us
down.

## What I ran into

### Bedrock: a new AWS account can't call any model, and the support case didn't help · high · Oct 5–23

- **Task:** draw characters with Claude on Bedrock, from a new AWS account.
- **Steps:** Converse and InvokeModel on Claude and Nova, as root, as an IAM role and with a Bedrock API key.
- **Expected vs actual:** a reply; got `Error 002: Access to Bedrock models is not allowed for this account` for every
  model, Oct 5–23. The console doesn't say the account is restricted, so we first suspected billing, IAM and the key.
- **Workaround:** none on AWS. The support case we filed on Oct 5 hasn't lifted the block. Gemini on a local server
  for the prototype.
- **Suggestion:** say in the error that the account is restricted, and how to lift it.

### Fire OS: a family app can get usage access only over ADB · high · Oct 2, Oct 5

- **Task:** count a kid's watching in every video app, from an app the parents install.
- **Steps:** look for usage access and display over other apps in the Fire TV's settings; grant both for the
  strict-mode test on the stick.
- **Expected vs actual:** a settings screen where a parent allows them; there is none, only `adb shell appops`. So a
  screen-time app that needs them can't ship through the Appstore.
- **Workaround:** strict mode is a sideloaded prototype, set up with two adb commands. The Appstore path relies on
  Amazon Kids' own limit.
- **Suggestion:** a settings screen for trusted family apps' permissions, or the Earned Time API
  ([FEATURE_REQUESTS.md](FEATURE_REQUESTS.md)).

### Vega Virtual Device: clicking OK does nothing out of the box · high · Oct 5

- **Task:** press a button with OK on the Vega Virtual Device, in an app made from the multi-TV starter.
- **Steps:** focus a button, click OK on the simulator's remote.
- **Expected vs actual:** the button's action; nothing happened. `Pressable` got only `onPressIn`: the click sound
  fails to bind `com.amazon.audio.system` and the key-up is lost. No error points to the manifest.
- **Workaround:** `com.amazon.audio.system` and `com.amazon.audio.control` under `[wants]` in `manifest.toml`. Scripts
  still can't press OK (Oct 19): `KEY_ENTER` arrives as `enter`, and `KEY_SELECT` and `KEY_OK` do nothing.
- **Suggestion:** put both services in the starter's manifest, and don't let a failed click sound eat the key-up.

### Amazon Kids on Fire TV: no way to tell where it's offered · high · Oct 5

- **Task:** test our Amazon Kids mode on a Fire TV Stick registered in Estonia.
- **Steps:** Settings → Account & Profile Settings → Add Profile.
- **Expected vs actual:** a kids profile, as in the docs; got none. The docs we found don't say which countries have
  it.
- **Workaround:** the mode is built to the docs, untested.
- **Suggestion:** list the countries in the docs, and let developers try Amazon Kids anywhere.

### Fire TV: voice input never reaches the app · high · Oct 12–13

- **Task:** let a kid who can't type describe a new character by voice.
- **Steps:** a text field with the system keyboard; hold the microphone on the remote, then on the Fire TV phone app.
- **Expected vs actual:** the words in the field; Alexa took them and opened a movie in Prime Video, or a show in
  another app. The keyboard offers voice typing only while it's on screen with a hardware remote connected, and the
  phone app's microphone never reaches it.
- **Workaround:** none. Kids type, or a grown-up types in our phone app.
- **Suggestion:** a dictation API for the app in front ([FEATURE_REQUESTS.md](FEATURE_REQUESTS.md)). Until then, a doc
  page on keyboard voice typing.

### Amazon Polly: no conversational voice for a cartoon character, and no Estonian · medium · Oct 7

- **Task:** give the narrator and each cartoon character a voice kids like, in the family's language.
- **Steps:** Polly's neural voices Ruth, Vicki and Lucia for English, German and Spanish, through SSML.
- **Expected vs actual:** a lively, conversational voice; they sounded flat for cartoon characters, and Polly has no
  Estonian voice.
- **Workaround:** Gemini's voices on our local setup. On AWS, Polly's generative voices for English, German and Spanish.
- **Suggestion:** conversational voices for characters, children's voices among them, and Estonian.

### aws login: asks again several times a day · medium · Oct 5–23

- **Task:** run the AWS CLI and the CDK with short-term credentials from `aws login`, without access keys.
- **Steps:** `aws login` (us-east-1), then a day of deploys and checks.
- **Expected vs actual:** one sign-in a day; the session kept running out, and every command then said `Your session
  has expired`. We ran `aws login` 12 times from Oct 5 to Oct 23, three times on each of the last two days. Once,
  after an interrupted sign-in, the page said only "you may have used an outdated link".
- **Workaround:** run `aws login` again, from the start when the page says outdated link.
- **Suggestion:** a session that refreshes itself through a working day, and a sign-in page that says what went wrong.

### Vega SDK: 20 GB to download before the first simulator run · low · Oct 5

- **Task:** try the Vega build on the Vega Virtual Device.
- **Steps:** install the Vega SDK with its installer, then `vega virtual-device start`.
- **Expected vs actual:** a small download for one simulator; the SDK takes about 20 GB of disk, and downloading and
  unpacking it took about 20 minutes.
- **Workaround:** none; it's a one-time cost.
- **Suggestion:** a smaller download with only the simulator and the CLI, for trying an app.

## What our coding agent ran into

Claude Code did most of the building. These are snags it hit in builds, logs and tool calls.

### Multi-TV starter: release builds keep old shared code · medium · Oct 5

- **Task:** change a screen in `packages/shared` and build the Fire OS release APK.
- **Steps:** `./gradlew assembleRelease`.
- **Expected vs actual:** the new screen; got the old one, with no warning. Gradle reported the JS bundle task up to
  date.
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
