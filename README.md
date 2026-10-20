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

## Run it

You need macOS or Linux with Node 22, Yarn 4 (via Corepack), and for the TV: the Android SDK with JDK 17 and `adb`, a
Fire TV stick with ADB debugging on (or the Android TV emulator), and optionally the Vega SDK.

**1. Backend and phone app** (on your computer, for a phone and a TV on the same Wi-Fi):

```sh
cd backend && npm install && cd ../parent-web && npm install && cd ..
scripts/dev.sh --seed     # a demo family (Mia and Leo, PIN 1234), in memory; without --seed your family is kept in .data/
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
cd tv/packages/expotv/android && ./gradlew :marble-strict:testReleaseUnitTest   # strict mode's engine
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
