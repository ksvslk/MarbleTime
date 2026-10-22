# MarbleTime

**TV time that kids earn with real-life jobs, on Fire TV.** The TV shows each kid a jar of marbles: the TV time they
have left today. A kid picks a job with the remote ("Toys away") and says "I did it!"; a grown-up says yes on their
phone, and the marbles drop into the jar on the big screen. A job done when the jar is already full, or five puzzle
stars, earn a new character: the kid types what it should be ("a dragon who loves pancakes"), an AI draws it, and it
waves and talks on the TV.

Built for the *Build, Ship, Shape* Amazon Developer Hackathon (Fire TV track). One React Native codebase runs on
**Fire OS** and **Vega OS**.

## What's in it

| Part | What it does | Where |
|---|---|---|
| TV app | "Who's here?", each kid's board (today's jar, job cards that show what they give), puzzles that earn stars, the kid's characters, the grown-ups' PIN; read aloud for kids who can't read yet (English, Estonian, German, Spanish) | `tv/` (shared screens in `tv/packages/shared`, Fire OS build in `tv/packages/expotv`, Vega build in `tv/packages/vega`) |
| Strict mode | Fire OS only (sideloaded): a native service counts the time each picked kid watches in any video app, locks video apps when a jar is empty or at bedtime, and keeps the TV's settings and the uninstall screen behind the PIN | `tv/packages/expotv/modules/marble-strict` (Kotlin) |
| Phone app | For grown-ups: approvals ("yes" / "not yet, because…"), jobs, each kid's daily budget, bedtime and puzzles, typing a new character's words, pairing TVs, notifications | `parent-web/` (React PWA) |
| Backend | One API for both apps, the jar's ledger, the character pipeline, puzzle banks, live updates | `backend/` (TypeScript; the same code runs locally and on AWS Lambda) |

How the TV time is enforced depends on the TV's mode, set per TV in the phone app:

| Mode | Runs on | Who enforces the time |
|---|---|---|
| **Amazon Kids** | Appstore build, Fire OS and Vega | Amazon Kids' own daily limit; earned minutes are handed off to it from the phone app |
| **Strict** | Fire OS, sideloaded | MarbleTime itself (above) |
| **API demo** | both | the *Earned Time API* we propose to Amazon ([docs/07](docs/07-earned-time-api.md)) |

## Try it without building

The backend and the phone app run on AWS until Nov 20, 2026. The TV builds are on the
[release page](https://github.com/ksvslk/MarbleTime/releases/latest).

1. **Phone app:** open <https://d3uyrtcal2s4t9.cloudfront.net> on a phone (or a desktop browser) and sign up with an
   email address; Cognito sends a code to confirm it. Your family starts empty: add a kid and a job or two.
2. **The TV app.**
   - *Fire TV (Fire OS):* on the TV, open Settings → My Fire TV → About and press Select on the device name 7 times.
     Then Developer options → ADB debugging on. From a computer on the same network: `adb connect <the TV's IP>:5555`
     (allow it on the TV) and `adb install MarbleTime-fireos.apk`. MarbleTime appears under Your Apps.
   - *No Fire TV:* the same APK runs in Android Studio's emulator with a Google TV system image (tested on Android 14):
     `adb install MarbleTime-fireos.apk`, then `adb shell am start -n app.marbletime.tv/.MainActivity`. The arrow keys
     and Enter work as the remote.
   - *Vega Virtual Device:* with the [Vega SDK](https://developer.amazon.com/docs/vega/latest/install-vega-sdk.html),
     `vega virtual-device start`, then `vega run-app MarbleTime-vega-aarch64.vpkg app.marbletime.tv.main -d VirtualDevice`
     (`-x86_64.vpkg` on an Intel computer).
3. **Pair:** the TV shows a QR code and a six-letter code. In the phone app, open TVs and scan the code, or type it and
   tap Go.
4. **Try it:** on the TV, pick the kid and a job, and press "I did it!". Say yes on the phone (a notification, or
   Approvals), and the marbles drop into the jar. The Puzzles card plays a round of five questions for a star.
5. **Strict mode (Fire OS only):** give the app its two permissions once, then set the TV to *Strict* in the phone app
   (TVs → the TV → Mode):
   ```sh
   adb shell appops set app.marbletime.tv GET_USAGE_STATS allow
   adb shell appops set app.marbletime.tv SYSTEM_ALERT_WINDOW allow
   ```
   Any video app is counted. `DemoCartoons.apk` from the release plays *Big Buck Bunny* if you'd rather not use your
   own. To see a jar run out in seconds, turn on the demo clock (a second counts as a minute):
   `adb shell am start -a android.intent.action.VIEW -d 'marbletime://open?fast=1' app.marbletime.tv` (`fast=0` turns
   it off).

On AWS, two things work differently from the demo video:

- **New characters can't be drawn there yet.** Amazon Bedrock is blocked on our AWS account ("Error 002", in
  [FRICTION_LOG](FRICTION_LOG.md); a support case has been open since Oct 5), so the TV says characters can't be made
  right now and the kid keeps the token. They work in the local setup below, and on AWS once the block is lifted.
- **Voices are Amazon Polly's**, in English, German and Spanish. Polly has no Estonian voice, so Estonian lines that
  aren't recorded in the app stay silent there.

## Run it

You need macOS or Linux with Node 22, Yarn 4 (via Corepack) and [mkcert](https://github.com/FiloSottile/mkcert), and for
the TV: the Android SDK with JDK 17 and `adb`, a Fire TV stick with ADB debugging on (or the Android TV emulator), and
optionally the Vega SDK.

**1. Backend and phone app** (on your computer, for a phone and a TV on the same Wi-Fi):

```sh
cd backend && npm install && cd ../parent-web && npm install && cd ..
scripts/dev.sh --seed     # a demo family (Mia and Leo, PIN 1234), in memory; without --seed your family is kept in .data/
MODEL_ID=fake scripts/dev.sh --seed    # the same without a Google Cloud sign-in: stand-in drawings for new characters
```

Open the printed `https://<computer>:5173` on your phone and sign in with any name (`demo` for the demo family). The
certificate comes from [mkcert](https://github.com/FiloSottile/mkcert); install its root certificate on the phone
once. Characters are drawn by the model in `MODEL_ID`: `fake` (a stand-in drawing, no AI, no account) or a
Gemini model on Vertex AI with your `gcloud` sign-in (the default; on AWS, a Bedrock model). See [backend/README.md](backend/README.md).

**2. The TV (Fire OS):**

```sh
cd tv && yarn install && cd ..
echo 'FIRETV=<stick ip>:5555' >> .env.local
scripts/fire.sh build && scripts/fire.sh connect && scripts/fire.sh install
scripts/fire.sh backend local    # the TV talks to your computer
```

The TV shows a QR code: scan it with the phone app (TVs → pair). For strict mode, give the app its two grants once
(`scripts/fire.sh grant app.marbletime.tv`) and set the TV to *Strict* in the phone app.

**3. The TV (Vega):** `source ~/vega/env && scripts/vega.sh build && scripts/vega.sh start && scripts/vega.sh run`.

**4. AWS:** `cd backend && npx aws-cdk deploy --context stage=dev` builds the same backend on Lambda, DynamoDB, Cognito,
API Gateway (HTTP and WebSocket), S3 and CloudFront ([backend/README.md](backend/README.md)).

## Tests

```sh
cd backend && npm test                              # API, ledger, budget, characters, puzzles (in memory; DynamoDB Local with npm run test:dynamo)
cd parent-web && npm test
cd tv/packages/shared && yarn test:logic             # the TV's rules: jar, claims, strict-mode picking, bedtime, read-aloud
cd tv/packages/expotv/android && ./gradlew :marble-strict:testReleaseUnitTest   # strict mode's engine (after scripts/fire.sh build makes android/)
```

Device checks (the stick, the Android TV emulator, the Vega simulator) are written up in
[docs/06-device-testing.md](docs/06-device-testing.md).

## Docs

- [docs/08-evidence-based-design.md](docs/08-evidence-based-design.md): every product decision, with the research behind
  it (screen-time guidance, rewards and motivation, checking AI-written questions) and the assumptions still to test
- [docs/03-architecture.md](docs/03-architecture.md): architecture, data model, strict mode, characters
- [docs/07-earned-time-api.md](docs/07-earned-time-api.md): the API we ask Amazon for
- [FRICTION_LOG.md](FRICTION_LOG.md), [FEATURE_REQUESTS.md](FEATURE_REQUESTS.md), [FEEDBACK.md](FEEDBACK.md): what we ran
  into with Amazon's tools, and what we'd like built
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): code, fonts, icons and sounds from others, with their licences

## Licence

MIT, see [LICENSE](LICENSE). Code, fonts, icons and sounds from others keep their own licences, listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
