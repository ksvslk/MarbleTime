# backend

The MarbleTime API: one Lambda behind an API Gateway HTTP API, one DynamoDB table, realtime updates over a WebSocket API, Web Push for parents, Cognito for parents, a worker Lambda that draws the kids' characters, the characters' voices (Gemini-TTS from Google, cached in S3 behind CloudFront) and listening to the kids' ideas (Gemini), and S3 + CloudFront for the parent web app, all in one CDK stack. **The contract is [`openapi.yaml`](openapi.yaml)**; the product rules are [docs/08](../docs/08-evidence-based-design.md) ("Decisions (Oct 7)"); the design is in docs/03 (§4 flows, §6 ledger, §7 data model, §9 security).

Its own npm package (Node 22, TypeScript), not part of the `tv/` Yarn workspace.

```
src/domain/     rules, no AWS imports: family.ts (parent name, family, kids, jobs), budget.ts (the daily budget and what an
                approval gives), claims.ts, ledger.ts (adjust, hand-off), characters.ts (the API side and the art director),
                drawing.ts (the drawing worker's rounds), character-prompts.ts (prompts, schemas, reading answers),
                speech.ts (TV lines, speech-to-text, WAV checks), pin.ts, devices.ts (pairing, TV state), realtime.ts,
                push.ts, validate.ts (one check per schema), repo.ts (storage)
src/ai/         the models: model.ts (the interface: strict JSON, plain text, pictures in), claude.ts (Anthropic SDK for
                Bedrock), nova.ts (Converse API), gemini.ts (Vertex AI, local only), fake.ts (a free stand-in), models.ts (MODEL_ID)
src/svg/        xml.ts (a small tree on saxes), check.ts (the code checks), css.ts (stylesheets → attributes),
                sanitize.ts, layers.ts (CharacterArt layers), layout.ts (the floor), rasterize.ts (PNG with @napi-rs/canvas), transform.ts
src/speech/     gemini-tts.ts (the voices), gemini-listen.ts (speech to text), audio.ts (WAV, loudness, limiter, the mouth),
                s3-cache.ts (S3 + CloudFront signed URLs), local-cache.ts (dev server)
src/repo/       memory.ts (tests, dev server) and dynamo.ts (production; the key design is at the top)
src/http/       router.ts, routes.ts (the route table, with who may call each), api-gateway.ts (events ↔ requests)
src/lambda.ts   the API Lambda           src/characters-lambda.ts   the worker (drawings, unfinished lines)      src/dev-server.ts   node:http → router
src/realtime-lambda.ts  the WebSocket Lambda    src/vapid-keys-lambda.ts, src/speech-keys-lambda.ts   key pairs made once (custom resources)
src/seed.ts     the demo family for the dev server       infra/              CDK app (app.ts) and stack (stack.ts)
test/           vitest, through the router: the same tests run on MemoryRepo and on DynamoDB Local; models and AWS are stand-ins
```

## Commands

```bash
npm install
npm test                    # typecheck + all tests (in memory; no model or AWS call)
npm run dev                 # API on http://0.0.0.0:8787 (PORT=…), data in memory; a TV on the LAN can reach it
npm run dev -- --seed       # … with the demo family (below)
DATA_FILE=../.data/dev.bin npm run dev   # … data kept in that file between runs (scripts/dev.sh does this)
MODEL_ID=fake npm run dev -- --seed   # characters without any model (a template character in the card's colours)
npx cdk synth               # CloudFormation template in cdk.out/; needs no AWS account
../scripts/fire.sh backend local      # the Fire TV uses this machine's server (pair it from the LAN parent app; `backend cloud` goes back)
```

**Dev server.** Parents sign in with `Authorization: Bearer dev-<name>` (parent id `dev-<name>`); only the dev server accepts this. CORS is `*`. `PWA_URL` (default `http://192.168.0.100:5173`) is where pairing links point.

**Locally with real models and speech** (Gemini draws, speaks and listens; everything with your gcloud sign-in):

```bash
gcloud auth login                       # once; Vertex AI uses your gcloud account
gcloud config set project <project>     # or GOOGLE_CLOUD_PROJECT=<project> below
PORT=8789 npm run dev -- --seed         # MODEL_ID defaults to gemini-3.8-flash
```

| Variable | Default | What |
|---|---|---|
| `PORT` | 8787 | the port (8787 is the usual one; use another for a second server) |
| `MODEL_ID` | `gemini-3.8-flash` | the characters' model; `fake` for the free stand-in (no sign-in); a Bedrock id calls Bedrock with your AWS credentials |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | gcloud's project, `global` | where Gemini runs (also the TTS quota project) |
| `TTS_MODEL` | `gemini-2.5-flash-tts` | the characters' voices (`gemini-2.5-pro-tts`, `gemini-2.5-flash-lite-preview-tts` work too; the narrator always uses the TV clips' model); `fake` hums offline, for both |
| `STT_MODEL_ID` | `gemini-3.8-flash` | the listener (the kid's ideas, and every new line heard back); `fake` always hears "a dragon who loves pancakes" |
| `SPEECH_DIR` | `<temp>/marbletime-speech` | the cache of spoken lines (served at `/dev/speech/<key>.wav`) |
| `PWA_URL`, `REALTIME_URL` | the LAN address | what pairing links and the TV's realtime point to |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | none (pushes are logged) | real Web Push |

Then: a parent `Bearer dev-demo` (Mia has a character token), a TV `Device dev-tv`. `POST /children/mia/characters {"description": "a dragon who loves pancakes"}` answers in a few seconds (the art director), and the drawing's rounds are logged; the character is ready in about 25–50 s. Without gcloud, `MODEL_ID=fake TTS_MODEL=fake STT_MODEL_ID=fake` (with a fake voice or fake ears, new lines aren't heard back); with a stale gcloud sign-in, speech answers `503 unavailable` saying to run `gcloud auth login`.
- **Characters** use `MODEL_ID`, default `gemini-3.8-flash` on Vertex AI with this machine's gcloud sign-in (project from `GOOGLE_CLOUD_PROJECT` or `gcloud config get-value project`, location `GOOGLE_CLOUD_LOCATION`, default `global`). The art director answers inside the request; the drawing runs in the server process, and its rounds are logged (problems, picture-check reasons, seconds; never the kid's words). `MODEL_ID=fake` needs no sign-in.
- **Speech** (Gemini voices for the TV, Gemini listening for the parent's phone) uses the same gcloud sign-in. A missing or expired one is a `503 unavailable` that says to run `gcloud auth login`. Lines are cached in `SPEECH_DIR` (default the system temp folder's `marbletime-speech`) and served by the dev server at `http://<LAN address>:<port>/dev/speech/<key>.wav`.
- `--seed` creates the family of parent `dev-demo`: English, Europe/Tallinn, PIN 1234; Mia (5, bear, gold: a 60-minute jar, 30 given, 20 minutes earned, one character token) and Leo (8, bunny, sky: 90, 50 given, 20 earned); the sample jobs from `data.ts` in whole marbles (brushing teeth is routine); and a paired TV whose token is `dev-tv`, so a TV build can use `Authorization: Device dev-tv` without pairing.

**Smoke test** (repo root): `scripts/api-smoke.sh` runs pair → claim on the TV → approve as parent → new balance on the TV against `API` (default `http://localhost:8787`), then cleans up. For a deployed API: `API=<ApiUrl> PARENT_TOKEN=<Cognito token> scripts/api-smoke.sh`.

**Tests on real DynamoDB semantics** (transactions, conditions, GSI): run [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html) (`java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -inMemory -port 8000`), then `npm run test:dynamo`. Every test gets its own table.

## Deploy

Deployed as `MarbleTime-dev` (us-east-1). Each deploy is approved by the user:

1. `aws login` (short-term credentials, us-east-1). No access keys.
2. Once per account: `npx cdk bootstrap aws://<account>/us-east-1`.
3. Build the parent app first if it should go out too (`parent-web/dist`; without it the bucket stays empty).
4. `npx cdk deploy --context stage=dev [--context budgetEmail=you@example.com] [--context modelId=us.anthropic.claude-sonnet-5-5] [--context speech=google --context googleProject=… --context googleWifProvider=… --context googleServiceAccount=…]` (`npx cdk diff` first). `modelId` is the characters' model (default Claude Haiku 4.5, `us.anthropic.claude-haiku-4-5-20251001-v1:0`); the Bedrock IAM follows it, and a Gemini model or `fake` is refused. `speech` is who makes the TV's lines: `polly` (the default, Amazon Polly; Speech below) or `google`, which needs the three Google settings (below). Outputs: `ApiUrl`, `PwaUrl`, `UserPoolId`, `UserPoolClientId`, `CognitoDomain`, `RealtimeUrl`.
5. `API=<ApiUrl> PARENT_TOKEN=<token> scripts/api-smoke.sh` with a token from signing in to the parent app.

**Bedrock is blocked on our AWS account** ("Error 002", FRICTION_LOG), so characters don't work in AWS until AWS lifts it; the Bedrock code paths are tested with stand-ins only.

### What the cloud needs for Google

Only with `--context speech=google`. The voices (Cloud Text-to-Speech, Gemini-TTS) and listening (Vertex AI, Gemini) are Google services, so the API Lambda needs Google credentials. The plan is **keyless Workload Identity Federation from the Lambda's AWS role** (no service-account key to store or rotate):
1. In the Google project: enable `texttospeech.googleapis.com` and `aiplatform.googleapis.com`; create a service account (e.g. `marbletime-speech`) with `roles/aiplatform.user`, and let it use the project's quota (`roles/serviceusage.serviceUsageConsumer`).
2. Create a workload identity pool with an **AWS provider** for account <aws account id>, and give the API Lambda's role (`principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/<pool>/attribute.aws_role/arn:aws:sts::<aws account id>:assumed-role/<ApiFunction role name>`) `roles/iam.workloadIdentityUser` on the service account.
3. In the code (not built yet): a token source in `src/ai/google-auth.ts` that signs an AWS `GetCallerIdentity` request with the Lambda's own credentials, exchanges it at `sts.googleapis.com` for a federated token, and impersonates the service account (`iamcredentials.googleapis.com … :generateAccessToken`); `google-auth-library`'s external-account client (Apache-2.0) does exactly this from the Lambda's environment. It replaces `notInAwsYet()` in `src/lambda.ts`.
4. Deploy with `--context googleProject=<id> --context googleWifProvider=//iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider> --context googleServiceAccount=<email>`; the stack hands them to the API Lambda (`GOOGLE_CLOUD_PROJECT`, `GOOGLE_WIF_PROVIDER`, `GOOGLE_SERVICE_ACCOUNT`).

Until step 3 exists, a deployed API answers `503 unavailable` for lines and listening, saying so; there is no Amazon fallback. (A service-account key in Secrets Manager would also work, but it is a long-lived secret.)

Stage `dev` deletes its data with the stack (table, bucket, user pool); any other stage keeps them. **Never change the logical ids** of the table (`Table`), the user pool (`Parents`), its client and domain, or the parent app's bucket (`Site`) and distribution (`Pwa`): they hold real data. The stack sets:
- the table (on demand, TTL, GSI1);
- the API Lambda (Node 22, arm64, 28 s: the art director and speech run inside requests) behind the HTTP API (stage throttled at 25 req/s, burst 50) with a Cognito JWT authorizer on parent routes; CORS for `http://localhost:5173` and the CloudFront URL;
- the worker (`CharactersFunction`, arm64, 1 GB, 10 minutes, no async retries), started by the API with an async invoke: each new character's drawing, and the rest of the tries of a speech line its request couldn't finish in 24 s; its bundle carries the Linux arm64 build of Skia (`@napi-rs/canvas`, installed for Lambda whatever machine synthesises);
- Bedrock `InvokeModel` for the configured model (its US inference profile and the model in every region the profile routes to) on the API (art director) and the worker (drawing, picture check); the Google settings for speech in the API's and the worker's environment (no AWS speech service), and both may store lines in the speech cache;
- the speech cache: a private bucket (objects expire after 30 days) readable only through its own CloudFront distribution, which accepts only signed URLs; the key pair is made once by a custom resource (private key in SSM Parameter Store as a SecureString, public key in a CloudFront key group);
- the user pool (email sign-in, self sign-up, email verification), an app client (no secret, code + PKCE) and a managed-login domain `marbletime-<stage>-<account>`; the private bucket + CloudFront for the parent app (SPA fallback);
- the WebSocket API with its Lambda, and the Web Push key pair (SSM, made once).

With `parent-web/dist` it uploads the app and a `config.json` with `{apiUrl, region, userPoolId, userPoolClientId, cognitoDomain, realtimeUrl}`. A $10/month budget alert is added only with `budgetEmail`.

### Who can sign up

By default anyone with the parent app's link can create an account (they only ever see their own, empty family).
`npm run deploy:dev` deploys the dev stack this way, without prompts (it shows the IAM changes but doesn't wait for a yes, so run `npx cdk diff` first when in doubt). Deploy with `--context signUp=closed` to stop new sign-ups; existing parents keep signing in, and new ones are added by an admin in the Cognito console (Users → Create user). Reopen with a deploy without the flag.

## The daily budget (docs/08, Decisions 2–4)

Each kid's jar is today's TV time (`src/domain/budget.ts`):
- **A marble is 10 minutes.** Every minute value in the API is a whole number of marbles: jobs are 10–30 minutes, bonuses and minus ±10–120.
- **The jar's size is `dailyMaxMin`**: by default 60 under 7 and 90 from 7; never above 60 under 7 or 120 from 7, and changing the age clamps it. **`dailyBaseMin`** (given every day, not earned) defaults to half of it rounded up to whole marbles (60 → 30, 90 → 50, 120 → 60) and is never above it. Values are clamped, not refused: a too-big maximum becomes the age's ceiling, a base above the maximum becomes the maximum. A new maximum without a base keeps the base unless it no longer fits.
- **Approving a claim** (the same rule on the phone and on the TV):
  - a routine job: `reward: praise`, nothing credited;
  - otherwise, `room = dailyMaxMin×60 − (dailyBaseMin×60 + balanceSec)`. With room for at least a marble: the job's minutes, at most the room rounded down to whole marbles (`reward: marbles`, `minutesCredited`), as a CHORE entry waiting for the hand-off;
  - with less than a marble of room (the jar is full): a character token (`characterTokens + 1`, `reward: character`, `minutesCredited: 0`).
  - The approval is written only if the kid's balance is still what the reward was worked out from, so two approvals at once can't overfill the jar.
  - `approverName`: the approving parent's name (`PATCH /me`); absent when approved on the TV or when the parent has no name.
- **Older data reads by today's rules:** jobs stored with 5–120 minutes round up to whole marbles, at most 30; kids without a maximum get their age's default; old bases (steps of 5) round up to whole marbles, at most the maximum; missing `routine` is false, missing `characterTokens` 0. Claims show the same rounded minutes.
- **The jar empties by hand-off** (Amazon Kids), at the family's next local midnight. Earned minutes wait in the jar (`balanceSec`) until handed off (or, later, used in strict mode). Marking hand-off entries DONE (added in Amazon Kids) or SKIPPED (settled another way) marks them at once (DONE also pays the penalty debt at once, so `pendingMinutes` is right straight away), but their minutes stay in the jar for the rest of the family's day: they are today's TV, so the daily maximum holds and the TV's marbles don't vanish when a parent taps "I added it". The kid records them as due (`handoffDueSec` for `handoffDueDay`).
  - After the next local midnight (family time zone), the kid's first read or write takes them out with one HANDOFF ledger entry (`createdBy: system`, dated at that midnight, reason "Handed off on <day>"), written once: it is conditional on the balance, the debt and the due as read, like an approval. Marks made before today count; today's wait. A write that settles tells the family (`changed`); a read just returns the new state.
  - What leaves is the entries' minutes less the debt a DONE paid: a minus already took its minutes out of the jar when it was made, so they don't leave twice.
  - Never below an empty jar: whatever the jar can't give up (a minus took those minutes after all, before or after the hand-off) pays the debt instead, so no minutes stay in the jar for good. The jar always holds pending minutes + today's due − the debt.
  - Marking the same entries twice settles them once; entries settled before HANDOFF entries existed are not backfilled.

## Characters (docs/08, Decisions 4–6)

A job approved while the jar is full gives the kid a character token; a grown-up types the kid's idea (or records it, `POST /speech-to-text`) and spends the token.
1. **The art director** (inside `POST /children/{id}/characters`, a few seconds): a strict, structured model call turns the kid's words into `{name, voice, voiceStyle, card}` or a kind no. Rules: never copy or imitate a character from a film, show, game, book or brand (invent an original from the kid's other words); scary becomes friendly; mild cartoon props are fine (a pirate's cartoon sword, a ninja stick, a hose), no realistic weapons, blood or scary faces. A no (or the model's own refusal) is `422 idea_not_ok` with a sentence to read to the kid; the token is kept. A model that can't be reached, or gives no usable answer, is `503 unavailable` (token kept). The card is cleaned in code (lengths clipped at a word, at most three colours).
   - **Languages and voices.** The kid's words may be English, Estonian, German or Spanish. The card stays English (it is for the illustrator); `name` and the no-sentence come in the family's language (a refusal without its own sentence gets a fixed one in that language); `voice` is one of the 12 Gemini voices, chosen to suit the character (Puck upbeat, Zephyr bright, Fenrir excitable, Leda youthful, Aoede breezy, Laomedeia upbeat, Achird friendly, Sadachbia lively, Autonoe bright, Algenib gravelly, Achernar soft, Vindemiatrix gentle). Characters made with the old Polly voices read as Gemini ones: Ivy → Leda, Justin → Puck, Kevin → Fenrir. Live (Estonian): "draakon, kes armastab pannkooke" → "Pannkoogidraakon" (Fenrir), "kole hirmus luukere" → "Luukere Luuks", a friendly skeleton.
   - **How it sounds** (`voiceStyle`, strict enums, `src/domain/voice-style.ts`): `pitch` high | medium | low, `pace` quick | normal | slow, `energy` bouncy | cheerful | calm | sleepy | bold, `texture` squeaky | clear | soft | breathy | gravelly | booming, picked to fit the character (a tiny dragon high, quick, bouncy, squeaky; a sleepy bear low, slow, sleepy, gravelly). Stored on the character and shown to parents (`Character.voiceStyle`); a word the code doesn't know becomes the mood's default, and characters made before voice styles get their mood's default (happy: medium, normal, cheerful, clear; silly: high, quick, bouncy, squeaky; sleepy: low, slow, sleepy, soft; …).
   - **Hedged** (`src/ai/resilience.ts`): Vertex's latency is bimodal (1–5 s, or 12–90 s; Oct 7). If no attempt has answered after 3 s another starts, 3 at once at most; with all three busy, the next one replaces the oldest extra attempt (the first keeps running, so a model that is slow every time still answers); a failed or unusable answer is replaced at once; 8 attempts in all. The first final answer (a card that reads, or a no) wins and the rest are aborted; nothing by 25 s is a 503, inside the API Lambda's 28 s. The log says which attempt answered and how fast, never the kid's words. Live on Oct 7: 6 of 6 ideas answered in 2.3–20 s (two after replacing three stalled attempts); without rotation, 2 of 3 timed out.
2. The character is stored as `drawing`, the token is used (in one transaction), and the **drawing worker** starts (an async Lambda invoke; in process on the dev server).
3. **Each round** (at most 3, first draw, repairs and redraws alike; `src/domain/drawing.ts`):
   - **Draw:** the drawing model draws the card (never the kid's words) with the measured rules (`DRAWING_RULES`: viewBox `0 0 512 512`, groups `body, head, eye-left, eye-right, mouth, arm-left, arm-right, legs, extra`, each with `data-pivot="x y"`, no text/script/foreignObject/image/links/filters, under 12 KB) plus the TV's rules: what each pivot is (body: bottom centre between the feet; head: the neck; eyes: their centres; mouth: its centre; arms: the shoulders; legs: the hips; extra: where it's attached), a filled mouth, left and right as the viewer sees them, standing on the floor (feet between y=470 and 500, nothing above y=16, centred), no background, the eyes, mouth, hats and hair inside the head group and held things inside the arm's.
   - **Check code** (`src/svg/check.ts`): size, XML, forbidden elements, the nine groups once each with pivots on the picture, eye-left/arm-left left of eye-right/arm-right; after sanitising, the mouth draws a filled shape; on the rendered picture, where the character stands (with a few units of slack). Problems go back word for word with the whole SVG for a corrected one. In the last round only, a drawing whose sole problem is its position is moved onto the floor in code (`src/svg/layout.ts`) instead of being lost.
   - **Sanitise** (`src/svg/sanitize.ts`): stylesheets folded into attributes, `<use>` expanded, only `svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath` and plain geometry/presentation attributes kept; event handlers, classes, styles, hrefs, masks, patterns, filters, text and anything pointing outside the drawing removed.
   - **Rasterise** to a 512×512 PNG with `@napi-rs/canvas` (Skia), and **the picture check**: a second call of the model looks at the PNG with the card: kid-friendly by the rules above, not a copy of a known character, matches the card. A no makes the next round a fresh drawing with the reason.
4. **Ready:** the whole SVG and the layers are stored, the character is `ready` with `readyAt`, and the family hears `changed`. **No success in 3 rounds:** `needs_help`, the token goes back, the family hears `changed`. A worker that crashes or times out leaves the character `drawing`; 15 minutes on, the next read settles it as `needs_help` with the token back.
5. **Layers** (`src/svg/layers.ts`), in drawing order, each a complete SVG with the same viewBox and only the gradients and clip paths it uses:
   - drawing outside the named groups becomes static layers (one per run of consecutive elements), which never move on their own;
   - a named group is a layer with its `part` and `pivot` (viewBox units, through any transforms of the part and its groups);
   - **nested named groups** (the measured drawings often put the eyes and mouth inside the head) are flattened: the inner part is its own layer and the outer part is cut around it, so `head` may be two layers (what is drawn before the eyes and after), both with the head's part and pivot. Each piece keeps what its groups passed down (fill, transform, opacity…). A part that draws nothing (an empty `extra`) has no layer.
   - **`parent`**: the named part a layer's part was drawn inside and rides on, at any depth (eyes and mouth inside the head → `head`; a sword inside an arm → that arm; a head inside the body → `body`). The TV moves the layer with its parent first, then around its own pivot. The pieces of a cut part keep that part's own parent (none for a part drawn at the top). Eyes and a mouth drawn beside the head rather than in it (60% of the measured drawings) get `parent: "head"` all the same: a face never leaves its head. The drawing prompt asks for the face inside the head group.
   - The layers put back together give the whole picture (tested pixel by pixel on the measured drawings).
6. **The worker's calls** (drawing, picture check) are big and no request waits for them: each gets 90 s and one retry after a failure (timeouts, network, 5xx), not hedging.
7. **Models** (`MODEL_ID`, one model for the three roles): Claude Haiku 4.5 on Bedrock by default in AWS (strict structured output through `output_config.format`, vision, plain text); Claude 5.x (JSON through a tool) and Amazon Nova (Converse, a forced tool) are a config change; Gemini 3.8 Flash on Vertex AI locally (`responseJsonSchema`); `fake` offline. Deploys refuse Gemini and `fake`.
8. A grown-up can remove a character in any state (`DELETE`): a drawing one is dropped (its worker stores nothing), and a drawing or ready one gives the token back, exactly once (the delete is conditional on the state it read); a `needs_help` one gave it back already.

Measured locally with Gemini 3.8 Flash on Oct 7 (5 ideas through the HTTP API): the art director takes 2–7 s; drawings were ready in 25–27 s on the first try (3 of 5) or about 50 s after one repair (2 of 5, both the position on the floor). "Spiderman but a duck" became a purple-caped duck with goggles, "a big scary skeleton" a smiling one in a party hat, "a zombie that eats people and has real guns" a kind no.

## Speech

**On AWS the TV's lines come from Amazon Polly** (`SPEECH_PROVIDER=polly`, the stack's default; `src/speech/polly.ts`), since Google's terms don't allow Gemini in an app for children (docs/01). English, German and Spanish: each character's Gemini voice is read as a Polly voice of its kind (Puck → Justin, Fenrir → Kevin and Leda → Ivy, Polly's child voices; the rest generative voices), and the narrator is Ruth, Vicki or Lucia. Polly has no Estonian voice: an Estonian line is a `503` at once (one try, not six) and the TV stays silent for it; its recorded clips still play. Polly reads the text as written and has no speaking style, so `style` isn't used and no line is heard back. Its PCM (16 kHz, the most it gives) is resampled to 24 kHz and finished like the Gemini lines below (loudness, mouth). There is no listening on AWS: kids type their ideas (docs/08, Oct 19).

The rest of this section is the Gemini setup: the dev server, and AWS with `speech=google`. Both ways in the family's language (en, et, de, es).
- **The TV's lines** (`POST /device/speech {text ≤ 160, lang, characterId?}`, `src/domain/speech.ts`, `src/speech/gemini-tts.ts`): Google Cloud Text-to-Speech with Gemini-TTS, `languageCode` en-US, et-EE, de-DE or es-ES. The request: `POST https://texttospeech.googleapis.com/v1/text:synthesize` with the Google token and `x-goog-user-project`, `{input: {prompt: <style>, text}, voice: {languageCode, name, modelName}, audioConfig: {audioEncoding: LINEAR16, sampleRateHertz: 24000}}`.
  - **A character** (`characterId`: a ready character of this TV's family, else `404 not_found`) speaks in character: its own `voice`, on `TTS_MODEL` (default `gemini-2.5-flash-tts`), with a style composed in code from fixed words: `A native Estonian speaker, as "a tiny dragon", a cartoon character for young children: high-pitched, squeaky, bouncy, at a quick pace, silly.` (the language, the card's `what`, the `voiceStyle`, the mood). The only model-written part is `what` (≤ 40 characters, checked when the card was made), quoted as data: quotes, line breaks and control characters stripped, capped at 40. The kid's words never reach the voice.
  - **The narrator** (no `characterId`) reads the family's own words that can't be recorded ahead (kids' names, job titles, "Feed the cat: done! – Dad", a bonus reason) exactly like the TV's recorded clips (`scripts/make-voices.py`, checked by a test): `gemini-2.5-flash-tts` whatever `TTS_MODEL` says, voice Leda, `A native Estonian speaker: warm, clear and friendly, to a young child.`, and the clips' finish (the silence before the first word cut to 50 ms, 300 ms of silence after the last).
  - **Styles describe, never command** (measured Oct 2026): without the language named, Estonian "Jee!" came out as English "gee"; commands such as "say it once, don't add words" were read aloud on short lines ("Thank you. Do not add, repeat, or change any words. Thank you.").
  - **Every new line is checked before it is cached or played** (`src/domain/line-check.ts`), as the clips are: its speech (the audio without the silence around it, 20 ms frames over -45 dBFS) may run at most 1 s + 0.15 s per character of the text; then Gemini (`STT_MODEL_ID`) hears it back with half a second of silence on each side (on very short clips it made up whole sentences), asked `Write exactly what is said in this Estonian audio, as Estonian text. Write numbers as digits. Only the words, nothing else.` (digits, as the TV writes them: "30 minutit" heard as "kolmkümmend minutit" would not match), and the letters (NFC, lowercase, `\w` only) must match with difflib's ratio ≥ 0.85 (measured: right lines 0.96–1.00, "Mia"/"Miia" and "Kärt-Liis"/"Kärtliis" included; wrong ones 0.25–0.69: "G J fun" for "Jee!", "Tubli tüdruk, Miia!" for "Tubli töö, Mia!", "Thank you Thank you"). A line that fails is made again, one try at a time, up to 6 tries in all; audio the listener couldn't hear back (the listener failed, not the voice) is heard again rather than made again, since the voice's quota is the scarce one. Only checked audio is cached. The log has the try, the seconds of speech and the score, never the words.
  - **The request waits 24 s** (the API Lambda has 28 s). With no right line by then it answers `503 unavailable` (the TV stays silent rather than say a wrong word) and the line **goes on in the background** with the tries it has left: on the dev server in the same process; on Lambda, where nothing outlives the response, the request stops its try in flight and hands the line to the worker (an async invoke of `CharactersFunction`, which calls `continueLine`). Once a try passes, the line is cached, and the TV's next request for it gets it at once. After 6 failed tries the line is let go (a later request starts again). A Google sign-in problem, or a cache that can't store, ends it at once.
  - **One maker per line**, wherever it runs: a lease (`LEASE#speech#<key>`, 90 s from each try's start, renewed per try, let go at the end) taken before anything is made. A request for a line being made in the same process waits for that maker (up to its own 24 s); one being made elsewhere (another Lambda instance, the worker) is a `503` at once. Only a request that starts a maker counts against the TV's hourly limit. A maker that dies holds the line for at most 90 s. Live (Oct 7): new lines took 6–9 s on the first try, 12–15 s with a retry; short English lines come out doubled now and then ("Thank you!" 1 time in 6 alone, 3 times running once: a 503).
  - The audio (a WAV, 24 kHz mono 16-bit; Gemini-TTS speaks at about -11 LUFS with peaks at 0 dBFS) is **normalised to -16 LUFS** integrated (ITU-R BS.1770-4: K-weighting, 400 ms gated blocks; checked against ffmpeg's ebur128) with a **look-ahead peak limiter at -1.5 dBFS**; a second pass makes up any loudness the limiter took. The read-aloud clips measure about -17, Polly's lines were -23.
  - **The mouth**: `{stepMs: 40, open: [...]}`, each step's loudness between a floor 24 dB under the loudest step and the loudest, smoothed (quick attack, slower release), the noise floor shut (0), 0..1 to two decimals. `durationMs` comes from the samples. No visemes (no Gemini voice gives them).
  - A line is made once: cached by `sha256(model|voice|style|lang|text)`, `narrator|` first for the narrator's (S3 objects `speech/v2/<hash>.wav` and `.json`), and `audioUrl` is a CloudFront signed URL valid for 48 hours (an S3 presigned URL would die with the Lambda's credentials, after hours). A line older than 27 days is copied onto itself on its next use, so a URL never outlives its file (objects expire after 30 days). A TV may make 60 new lines an hour (`429 too_many`, `Retry-After`); cached lines don't count.
  - Hedged modestly (`src/ai/resilience.ts`; the project's per-minute Gemini-TTS quota is low, 3 calls at once already hit it): another attempt when none has answered for 5 s, never more than 2 at once, no rotation; a `429` from Google pauses and tries again inside the same attempt (as long as `Retry-After` or the error's `RetryInfo` asks, else 1.5 s, 3 s, 6 s…, at most 8 s each) until the deadline. A voice call with nothing by 20 s is a failed try; cache failures are `503 unavailable` ("the TV stays silent"). Measured: 2.6–4.9 s per voice call, 2.4–3.8 s to hear it back, 1 ms from the cache. Hearing back is hedged like listening to the kid (another attempt after 4 s, 3 at once).
- **Speech to text** (`POST /speech-to-text`, parent; `src/speech/gemini-listen.ts`): the body is a WAV (16 kHz, mono, 16-bit PCM, at most 15 s; `audio/wav`). API Gateway delivers it base64-encoded; it is decoded to bytes, never through text. The header is checked (RIFF/WAVE, PCM or extensible PCM, a LIST chunk or a streaming size of 0 are fine), and the samples go to Gemini (`STT_MODEL_ID`, default `gemini-3.8-flash`) as a plain WAV inline (`audio/wav`), with a strict schema `{text}`: an exact transcript in the family's language, words in another language kept as said, nothing added, "" if nothing was said.
  - **Silence never reaches the model**: a recording with no 30 ms stretch above -45 dBFS (a quiet room) is `{"text": ""}` at once. (Asked about 2 s of silence, Gemini answered "Schmuckbär".)
  - Hedged: another attempt when none has answered for 4 s, 3 at once, nothing by 20 s is `503 unavailable`. Measured: about 3 s.
  - `400 bad_audio` for another format, `413 too_large` over 15 s, `429 too_many` after 60 an hour per family. Neither the audio nor the words are stored or logged (only attempt counts and timings).

## Data model

One table, `PK`/`SK`, GSI1 (`GSI1PK`/`GSI1SK`), TTL attribute `ttl`. The full key list is at the top of `src/repo/dynamo.ts`. Notes beyond docs/03 §7:

- **Claims** are `CLAIM#<id>`: the id is the TV's UUID, so a resend is a conditional put. GSI1 lists them per family (`W#…` while waiting, `D#<decidedAt>…` once decided), so the TV's state never reads old history. A claim keeps the job's `routine` from claim time; the decision adds `reward`, `minutesCredited` and `approverName`.
- **"Once per day"** is a slot item, `SLOT#<child>#<job>#<day>` (or `#once`), taken in the same transaction as the claim, so two TVs can't both claim the same job at once.
- **Idempotency** records, `REF#<child>#<client id>`, store what an adjust produced, so a repeat returns it (TTL 30 days).
- **Hand-offs due** are two attributes on the child (`handoffDueSec`, `handoffDueDay`): only one day's minutes at a time, since a new day's mark settles the older ones first.
- **Characters** are `CHAR#<id>` (status, the kid's words, name, voice, voiceStyle, card) and, once ready, `ART#<id>` (the whole SVG and the layers, written once): lists read only the small items. Tokens are a counter on the child, changed in the same transaction as the character (use, give back, remove).
- **Rate windows**, `RATE#<key>#<window start>` (a TV's new lines, a family's transcriptions), are counters with a condition, gone an hour after their window.
- **Leases**, `LEASE#<name>` / `META` (`holder`, `until`), let one maker at a time make something, whichever process or Lambda it runs in (today: a speech line, `speech#<cache key>`). Taken with a condition (free, run out, or the holder's own), let go by the holder only, gone an hour after they run out (TTL).
- **The parent's name** is `USER#<sub>` / `PROFILE`, so it can be set before onboarding.
- **Realtime connections**: `CONN#<f>` / `<connection id>` (TTL 3 hours), plus `CONNID#<id>` / `META` → family, so $disconnect finds it.
- **Push subscriptions**: `FAM#<f>` / `PUSH#<sha256 of the endpoint>`.
- **Bonuses and taken-away minutes** (BONUS and PENALTY entries) are also on GSI1 (`ADJ#<family>` / `<createdAt>#<id>`), so the TV's 7-day list is one small query per poll.
- **Old brain-game data** is ignored: `POOL#`/`FILL#` items expire by TTL, `gameDay`/`gameMarbles` on children are never read, GAME ledger entries stay in the history.
- **Tokens:** GSI1 `TOKEN#<sha256>` sits on the device item. Only the token's hash is stored. GSI reads are eventually consistent, so a miss looks once more after 300 ms.

## Realtime and notifications

**Realtime** (x-realtime in openapi.yaml). The stack output `RealtimeUrl` (and `realtimeUrl` in `config.json` and in the TV's `GET /device/state`) is `wss://<api id>.execute-api.us-east-1.amazonaws.com/<stage>`.

- Connect with one query parameter: a TV `?device=<device token>`, a parent `?token=<Cognito access or ID token>`. Anything else is refused at the handshake (401).
- Server → client: only `{"type": "changed"}`. Whenever a request or the drawing worker changes something a family sees (claims, decisions incl. on the TV, rewards and tokens, bonuses and minus, hand-offs, settings incl. on the TV, kids, jobs, TVs, pairing, a parent's name, a character created, ready, needing help, settled or removed), every open connection of that family gets it once, even if the request did several things. Reads, failed writes, repeats that change nothing, speech and speech-to-text send nothing.
- Client → server: `{"type": "ping"}` is answered `{"type": "pong"}`; anything else is ignored. Sending is best-effort and never fails a request.

**Web Push.** `GET /push/key` gives the VAPID public key; `POST /push/subscriptions` saves a browser (`DELETE` with `{endpoint}` forgets it). When a kid says "I did it!" (a new claim, not a resend), every subscribed browser of the family's parents gets title "Mia: Toys away is done", body "+10 min · tap to answer" in the family language, data `{url: "/", claimId}`. Browsers the push service reports gone (404/410) are forgotten; a failure never fails the claim.

**Dev server.** Realtime is on the same port: `ws://<host>:8787/realtime?device=<token>` (or `?device=dev-tv` with `--seed`) and `?token=dev-<name>` for parents. Pushes are logged instead of sent, unless `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set.

## Decisions on points the contract leaves open

- **Deciding twice.** The same decision again returns the claim unchanged (no second credit). The opposite decision on a decided claim is `409 already_decided`.
- **Which day a claim is on.** The family-local date of the claim's `at` (if `at` is in the future or more than 7 days old, the server's time). A waiting or approved claim holds the day; a rejected or taken-back one frees it.
- **One-off jobs** ("gone once approved"). When a kid's claim is approved, the kid comes off the job; the job is deleted when nobody is left.
- **Routine at claim time.** A claim is rewarded by whether the job was routine when the kid claimed it (claims from before routine jobs follow the job as it is now).
- **Deleting a kid** deletes their ledger, claims, idempotency records and characters, and takes them off their jobs; a job left with nobody is deleted.
- **DELETE is idempotent:** 204 even when already gone (kids, jobs, TVs, claims, characters).
- **Taking minutes away never goes below an empty jar.** A minus takes `min(asked, minutes in the jar)`; with nothing in the jar it's `409 empty_jar`.
- **Hand-off debt** is a running `debtSec` on the child. A PENALTY adds what it took; marking entries DONE pays the debt from those entries' minutes; SKIPPED pays nothing when marked. `pendingMinutes = max(0, floor((Σ PENDING − debt) / 60))`. CHORE and BONUS entries are PENDING whatever the TV's mode; characters and praise are not hand-off entries. At the next local midnight the marked minutes leave the jar with a HANDOFF entry, and what the jar couldn't give up pays the debt (see "The daily budget").
- **Pairing.** After the token has been handed out, polls say `paired` without it; a TV removed before it fetched its token gets `expired`. Codes are case-insensitive.
- **ETag** covers everything in DeviceState except `serverTime`, including `characters`.
- **Lists.** The TV's claims are all waiting ones plus those decided in the last 7 days. `GET /claims` returns every waiting claim plus the 200 most recently decided. Kids, jobs and TVs come oldest first; characters newest first (also in DeviceState).
- **PIN on the TV.** Decisions and settings share one wrong-PIN counter per TV: after 5 wrong PINs within a minute, `429 too_many_tries` with `Retry-After`.
- **Rate limits** are per clock hour (fixed windows), `429 too_many` with `Retry-After`: 60 new lines per TV, 60 transcriptions per family, 30 character ideas per family (art director calls, counted only when the kid has a token; the token is kept).
- **Defaults.** Job colours rotate peach, mint, sky, lilac; jobs repeat daily and aren't routine unless set; changing a title keeps the icon; `routine` left out of a PATCH stays as it was.
- **Text and ids.** Text is trimmed; lengths count characters. Ids must match `^[A-Za-z0-9_-]{1,64}$`.

## For the apps

- **Errors:** `{"error": {"code", "message"}}`. Codes:
  - `invalid` (400, message names the field), `invalid_json`, `bad_audio` (400)
  - `unauthorized`, `unpaired` (401)
  - `wrong_pin`, `no_pin` (403)
  - `not_found`, `no_family` (404)
  - `method_not_allowed` (405)
  - `family_exists`, `already_claimed`, `not_on_board`, `not_today`, `already_decided`, `already_paired`, `empty_jar`, `id_in_use`, `no_tokens`, `busy` (409)
  - `expired` (410), `too_large` (413), `idea_not_ok` (422: the message is a sentence to read to the kid)
  - `too_many_tries`, `too_many` (429, `Retry-After`: ideas, lines, transcriptions), `unavailable` (503: a model or speech service can't help now, the token is kept; on the dev server, the message says when `gcloud auth login` is needed)
- **TV:**
  - Live updates: connect to `realtimeUrl` from `GET /device/state` with `?device=<device token>`; on `{"type": "changed"}`, fetch `GET /device/state` (with the ETag). Keep polling every 15 s.
  - Kids carry `dailyMaxMin` (the jar), `dailyBaseMin` (given today), `balanceSec` (earned, not yet used) and `characterTokens`. Claims carry `reward`, `minutesCredited` and `approverName` once approved (the celebration: "You fed Rex! – Dad").
  - `characters` lists drawing and ready ones, with each one's `voice` and `mood`; fetch a ready one's layers once from `GET /device/characters/{id}` (it never changes: keep it). Draw the layers in order; move a layer with its `parent` part first (the parent's own parent before that), then rotate or scale it around its `pivot`; static layers never move.
  - Lines: `POST /device/speech {text, lang, characterId}` (a ready character's id; the family's `lang`) for a character, or `{text, lang}` for the narrator (the family's own words, in the recorded clips' voice) → `{audioUrl, durationMs, mouth: {stepMs, open}}`; the same text, speaker and language give the same audio. Play the WAV and set the mouth's openness from `open[floor(ms / stepMs)]`. A new line can take 6–24 s (it is heard back before it is kept); a `503` means stay silent: the line may still be finishing in the background, and asked again later (say, the next time it is needed) it usually comes from the cache at once.
  - Outbox: drop a request on 4xx other than 401 and 429; retry on 5xx and network errors.
- **Parent app:**
  - `PATCH /me {name}` (1–24 characters) before or after onboarding; `GET /me` returns it.
  - Characters: `POST /children/{id}/characters {description}` → 202 (drawing), then reload on `changed`; `GET` lists them with the SVG of ready ones; `DELETE` in any state.
  - Hand-off: `POST /children/{id}/handoff` marks the entries now; their minutes leave the jar at the family's next local midnight (a HANDOFF entry in the ledger, on the kid's first read or write after it).
  - Speech: record, convert to 16 kHz mono 16-bit WAV in the browser, `POST /speech-to-text` with `Content-Type: audio/wav`; show the text for a grown-up to check before sending it as the idea.
  - Budget: `dailyMaxMin` and `dailyBaseMin` on POST/PATCH `/children` are clamped (the answer has what was stored); jobs take `minutes` 10/20/30 and `routine`.
  - Live updates and notifications as before: `realtimeUrl` from `/config.json` with `?token=<access or ID token>`; `GET /push/key` → subscribe → `POST /push/subscriptions`.
  - CORS allows `authorization`, `content-type`, `if-none-match` and exposes `etag`.
