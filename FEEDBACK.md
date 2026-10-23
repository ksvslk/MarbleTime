# Product feedback

MarbleTime was built Oct 5–22, 2026 by one developer with a coding agent (Claude Code) on an Apple Silicon Mac, and
tested at home on a Fire TV Stick 4K Plus (Fire OS 8) and on the Vega Virtual Device. For each tool below: what we
used it for, what worked, what needs work, how getting started went, and whether we'd build with it again. The main
snags are written up with steps, a workaround and a suggestion in [FRICTION_LOG.md](FRICTION_LOG.md) (cited by
date); what we'd like Amazon to build is in [FEATURE_REQUESTS.md](FEATURE_REQUESTS.md).

| Tool | Used for | Build with it again? |
|---|---|---|
| Fire TV Stick 4K Plus, Fire OS 8, ADB | The main device: the app, strict mode, every device check | Yes |
| React Native multi-TV starter, Expo TV | One codebase for Fire OS and Vega | Yes |
| Vega SDK, CLI and Virtual Device | The Vega build | Yes, once presses, links and fonts stop failing silently |
| Amazon Kids | The Appstore mode's time limit | Couldn't try it: not offered in Estonia |
| AWS: CDK, Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront | The backend for both apps | Yes |
| Amazon Bedrock | Drawing characters | Yes, the day our account may call it |
| Amazon Polly | The voices on AWS: read-aloud and characters, in English, German and Spanish | Yes, and in Estonian once Polly has it |
| Amazon Transcribe | Listening to a kid's idea, in the first build (until Oct 7) | Not needed since kids type their ideas |
| AWS MCP Server, AWS agent skills | Help for the coding agent with AWS | The skills, yes; the server once it says when the sign-in has expired |
| Amazon Devices Builder Tools | Vega docs search for the coding agent (from Oct 20) | Yes, from day one |

## Fire TV Stick 4K Plus (Fire OS 8) and ADB

- **Used for:** everything the kids see, and strict mode: a Kotlin foreground service (UsageStatsManager and an
  overlay) that counts the minutes each kid watches in any video app, and locks video apps when a kid's jar is empty
  or at bedtime. Every TV change was checked on the stick over Wi-Fi ADB: screenshots, logcat, and `screenrecord`
  frame by frame for animations.
- **Worked well:**
  - ADB over Wi-Fi is all a coding agent needs to build, install, open a test screen with a deep link, press keys and
    take a screenshot. So every change got a check on the device, not only a code review.
  - Standard Android APIs work as documented. Strict mode put YouTube, Prime Video and Netflix behind our "Who's
    watching?" screen 0.6–0.8 s after they opened, and "Alexa, open YouTube" a second after YouTube appeared.
- **Needs work:**
  - Amazon Kids profiles aren't offered in Estonia, and nothing on the device or in the docs says so (Oct 5).
  - Usage access and display-over-other-apps can only be granted over ADB. There's no settings screen, so a normal
    family can't set up a parental-control app (FEATURE_REQUESTS).
  - No way for an app to hear what is said to the remote. The phone app's microphone always goes to Alexa's search,
    even over an open text field, and takes the child out of the app (Oct 12, Oct 13). Kids who can't type can't
    describe their character by voice, so we dropped voice input.
  - The default text-to-speech engine (IVONA) has no voices for apps; Pico works only with a `<queries>` entry (Oct 5).
  - Screenshots of a playing video are black (Oct 5), and `am start -W` hangs while the screensaver runs.
  - Recording the screen for a demo video is hard. The stick offers apps only software video encoders, so
    `screenrecord` gets about 12 fps at full HD while the TV shows 60. Our first cut looked jumpy because of it. It
    took scrcpy at 960×540 and a 30 fps cartoon to get a steady 30 fps, and nothing records the sound (Oct 20).
- **Getting started:** about 10 minutes: Developer options, ADB debugging, `adb connect`.
- **Again?** Yes. Sideloading on Fire OS is what made strict mode possible at all. We'd still rather call an Earned
  Time API than run our own lock screen ([docs/07](docs/07-earned-time-api.md)).

## React Native multi-TV starter and Expo TV

- **Used for:** the TV app. One shared package of screens and logic, built for Fire OS with Expo TV
  (react-native-tvos) and for Vega. Two native Expo modules in Kotlin: strict mode and a small SoundPool player.
- **Worked well:** `AmazonAppDev/react-native-multi-tv-helloworld` (MIT-0) gave us a working monorepo for both
  platforms on the first day. Remote focus works with the standard components. Expo's module API kept the Kotlin
  modules small, and strict mode's rules unit-testable on the JVM.
- **Needs work:**
  - Release builds kept old shared code. Gradle's bundle task doesn't see edits in `packages/shared`, so the APK
    silently had yesterday's screens (Oct 5).
  - The starter pins an exact Vega SDK patch version, so the first build after a fresh SDK install fails (Oct 5).
  - The starter's Vega manifest lacks two audio services, so OK presses never reach `onPress` (Vega, below).
  - `expo-audio` gives every player a media session, so after Home our app kept the remote's play/pause button. We
    wrote the SoundPool module instead.
- **Getting started:** good. Both builds ran on the first day, apart from the version pin.
- **Again?** Yes.

## Vega SDK, Vega CLI and Vega Virtual Device

- **Used for:** the Vega build of the same app, run on the Vega Virtual Device (VVD) on the Mac. It runs everything
  except sound: Vega has no simple player for short sounds (below), and we haven't built one on its media player.
- **Worked well:** the installer runs unattended (`NONINTERACTIVE=true`), the VVD runs on Apple Silicon, and the
  shared screens, focus and motion work with only a few platform files (`*.kepler.tsx`).
- **Needs work:**
  - OK never reached `onPress` until the manifest asked for `com.amazon.audio.system` and `com.amazon.audio.control`,
    and nothing pointed there (Oct 5, high). Scripted presses still can't reach `onPress` with SDK 0.24 (Oct 19), so
    screens can only be checked from a script by test link.
  - No command-line screenshot of the VVD; capturing its window works only while the window is on screen (Oct 6).
  - An app's own link scheme can't open it. Only `pkg://<component>?query` works, and the rule is written in a file
    in the SDK's header folder (Oct 19).
  - A custom font silently falls back to the system font unless it sits in `<app>/assets/fonts/` (Oct 19).
  - No simple player for an app's own short sounds (Oct 5). `react-native-svg` needs a hand-made Metro alias, and
    `vda` stops working while a Fire TV stick is also connected.
- **Getting started:** the install was easy: one script and about 20 GB of disk. Most of our Vega time went into
  things that fail without an error: buttons, links, fonts.
- **Again?** Yes, for the Appstore path. A CLI screenshot and scripted presses that work would make it as quick to
  develop for as Fire OS.

## Amazon Kids

- **Used for:** the Appstore mode. Amazon Kids keeps the daily limit. When a kid earns minutes, the phone app shows
  the parent how many to add as bonus time in the Parent Dashboard.
- **What happened:** we couldn't try it. Kids profiles aren't offered on Fire TV in Estonia (Oct 5), so the mode is
  built to the docs and untested.
- **Needs work:** a list of the countries in the docs, a way for developers to try Amazon Kids anywhere, and an API
  for adding earned time. Today a parent copies the minutes over by hand (FEATURE_REQUESTS: the Earned Time API,
  critical).
- **Again?** It's the path we'd ship first, because it is safe for families and works on Vega too.

## AWS (for the AWS Builder mini-challenge)

One CDK stack (`backend/infra/stack.ts`, first deployed Oct 6 as `MarbleTime-dev` in us-east-1):

- **API Gateway HTTP API → one Lambda** (Node 22, arm64) with the whole domain: each kid's jar and its ledger,
  daily budgets, jobs and approvals, pairing, characters and puzzles. Parents sign in with **Cognito** (managed
  login, JWT authorizer); TVs use device tokens.
- **DynamoDB:** one table (on-demand, TTL, one index) for families, kids, ledgers and devices.
- **API Gateway WebSocket API → Lambda:** live updates, so a "yes" on the phone drops the marbles on the TV at once.
- **A Lambda worker** draws characters (1 GB, up to 10 minutes). It renders each drawing with Skia
  (`@napi-rs/canvas`) for the picture check.
- **S3 + CloudFront:** the parent web app, and the characters' pictures and voice clips in a private bucket behind
  CloudFront signed URLs. The signing key pair is made by a custom resource, with the private key kept in **SSM
  Parameter Store**, like the Web Push key.
- **Amazon Polly:** the TV's read-aloud and the characters' voices on AWS, in English, German and Spanish (no
  Estonian on Polly, so Estonian lines that aren't recorded in the app stay silent there).
- **Amazon Bedrock** (Claude Haiku 4.5 by default; IAM limited to that inference profile): the character pipeline
  (an art director, the drawing, a picture check). Blocked on our account (below). Puzzles come from banks written
  ahead of time and checked by code.
- **AWS Budgets:** an optional $10/month alert.
- The same TypeScript runs as a local dev server and on Lambda; the 406 backend tests run in memory and against
  DynamoDB Local.

What we found:

- **Worked well:**
  - `aws login` (AWS CLI 2.32+) gave the agent short-term credentials from a browser sign-in: no access keys, no
    SSO setup.
  - CDK deploys everything with one command, Cognito's sign-in page and CloudFront's signing keys included, and
    `cdk diff` made each deploy easy to review before approving it.
  - DynamoDB Local let the same tests run against the real data layer.
- **Needs work:**
  - **Bedrock is blocked on our new account:** `Error 002: Access to Bedrock models is not allowed for this
    account`, for every model, Amazon's Nova included, for over two weeks now. Adding a payment method didn't lift
    it. Nothing in the console says the account is restricted, and with the free support plan the CLI can't even
    read the support case (Oct 5). This was our biggest blocker. While it lasts, our local setup draws characters and
    writes puzzle sets with Google's Gemini, and the voices come from Google's Gemini-TTS. Google's terms don't
    allow its generative AI in apps for under-18s, so that is a stand-in for the prototype, not how MarbleTime would
    ship. On AWS the stack already sends characters to Bedrock, so they work there the day the block lifts. The
    voices there are Polly's, in English, German and Spanish; Polly has no Estonian.
  - `HttpLambdaIntegration` adds one Lambda permission per route (Oct 5).
  - A presigned S3 URL stops working when the Lambda's credentials expire, hours before its `expiresIn`, and the
    presigner doesn't warn. We read it in the S3 guide and used CloudFront signed URLs instead.
  - `NodejsFunction` has no documented way to bundle a native module for Lambda from a Mac without Docker.
  - `npm audit` flags a high advisory inside aws-cdk-lib's bundled dependencies, which users can't update.
- **Polly and Transcribe** (the first character build, until Oct 7): Polly needs two requests per line (the audio,
  then the lip-sync marks) and returns no length for an MP3. Transcribe streaming takes raw PCM, not WAV. Polly has no
  Estonian voice, so on Oct 7 we moved the voices and the listening to one provider that covers all four of our
  languages (FEATURE_REQUESTS).
- **AWS MCP Server and AWS agent skills** (set up for Claude Code by the AWS CLI on Oct 5): the `signing-in-to-aws`
  skill checked our first `aws login` and set the region. The MCP server never connected. When the `aws login`
  session has expired it answers "Invalid request parameters", and the real message ("Please reauthenticate using
  'aws login'") only goes to its own log, which the agent doesn't see (Oct 20). So the agent never had its tools.
- **Getting started:** smooth, apart from Bedrock.
- **Again?** Yes. We'd keep the whole backend on AWS and move the AI back to Bedrock as soon as the account may call
  it.

## Amazon Devices Builder Tools (MCP server and skills)

- **Used for:** planned for day one but installed only on Oct 20 (version 1.0.17), then used on our two open Vega
  gaps: the Vega build has no sound yet, and scripts can't press buttons on the Virtual Device. A running Claude Code
  session only connects a new MCP server after a restart, so we called its tools through its `exec` command, and
  used its skills.
- **Worked well:**
  - One command installs the MCP server, an opt-in `adbt-dev` agent and 20 skills. The skills appeared in the
    running session at once.
  - `search_documentation` covers Amazon's docs, curated guides and the developer forum in one call. It found the
    remote's key-name reference, the Appium for Vega guide, and a forum thread from another team with our exact
    problem.
  - It pointed us to the right building block for sound: `AudioPlayer` in `@amazon-devices/react-native-w3cmedia`.
- **Needs work:**
  - `read_document` on a Vega API reference page returned only the site's navigation menu, 100,000 characters of it,
    and none of the page (Oct 20). We read the npm package's README and type definitions instead.
  - Search results repeat the same page once per SDK version (0.21–0.24), and a search for short sound effects led
    with WebView/WebGL tips.
  - The key reference lists `KEY_ENTER` as Select, but a scripted `KEY_ENTER` never fires `onPress`. The documented
    alternative, Appium, is reported as flaky on the Virtual Device.
  - The default "steering" document for Claude Code is long and strict: a six-step setup before the first answer of
    every session, and a mandatory question about the platform. The package is UNLICENSED, so we kept its text out
    of our repo and used the opt-in agent instead.
  - `exec` output stops at 64 KB when it goes through a pipe.
- **Getting started:** a few minutes. We'd have got more from it by installing it on day one, as planned.
- **Again?** Yes, from the start of the next project, mostly for the docs search. Sound on Vega still needs a short
  recipe for app sound effects, which it doesn't have yet.

## Not from Amazon, but part of how it was built

**Claude Code** wrote nearly all the code and docs, and ran the device checks through ADB and the Vega CLI. Tools
with a CLI and clear errors (ADB, the AWS CLI, CDK) worked best with it. Silent failures (Vega presses, links, fonts)
cost the most time.
