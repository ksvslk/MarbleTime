# backend

The MarbleTime API: one Lambda behind an API Gateway HTTP API, one DynamoDB table, Cognito for parents, and S3 + CloudFront for the parent web app, all in one CDK stack. **The contract is [`openapi.yaml`](openapi.yaml)**; the design is in docs/03 (§4 flows, §6 ledger, §7 data model, §9 security).

Its own npm package (Node 22, TypeScript), not part of the `tv/` Yarn workspace.

```
src/domain/     rules, no AWS imports: family.ts (family, kids, jobs), claims.ts, ledger.ts (adjust, hand-off, games),
                devices.ts (pairing, device tokens, TV state), validate.ts (one check per schema), repo.ts (storage interface)
src/repo/       memory.ts (tests, dev server) and dynamo.ts (production; the key design is at the top)
src/http/       router.ts (one small router for every route) and routes.ts (the route table, with who may call each)
src/icons.ts    job icons (same as the TV's JOB_ICONS) + keyword matcher in en/et/de/es; marked hook for an AI pick
src/lambda.ts   API Gateway (payload 2.0) → router        src/dev-server.ts   node:http → router, data in memory
src/seed.ts     the demo family for the dev server       infra/              CDK app (app.ts) and stack (stack.ts)
test/           vitest, through the router: the same tests run on MemoryRepo and on DynamoDB Local
```

## Commands

```bash
npm install
npm test                    # typecheck + all tests (in memory)
npm run dev                 # API on http://0.0.0.0:8787 (PORT=…), data in memory; a TV on the LAN can reach it
npm run dev -- --seed       # … with the demo family (below)
npx cdk synth               # CloudFormation template in cdk.out/; needs no AWS account
```

**Dev server.** Parents sign in with `Authorization: Bearer dev-<name>` (parent id `dev-<name>`); only the dev server accepts this. CORS is `*`. `PWA_URL` (default `http://192.168.0.100:5173`) is where pairing links point. `--seed` creates the family of parent `dev-demo`: English, Europe/Tallinn, PIN 1234, Mia (5, bear, gold, numbers + puzzles, 35 min) and Leo (8, bunny, sky, words + numbers, 20 min), daily cap 4, and the sample jobs from `data.ts`. It also creates a paired TV whose token is `dev-tv`, so a TV build can use `Authorization: Device dev-tv` without pairing.

**Smoke test** (repo root): `scripts/api-smoke.sh` runs pair → claim on the TV → approve as parent → new balance on the TV against `API` (default `http://localhost:8787`), then cleans up. For a deployed API: `API=<ApiUrl> PARENT_TOKEN=<Cognito token> scripts/api-smoke.sh`.

**Tests on real DynamoDB semantics** (transactions, conditions, GSI): run [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html) (`java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -inMemory -port 8000`), then `npm run test:dynamo`. Every test gets its own table.

## Deploy (later, once the user approves the first deploy)

Nothing here has been deployed. When approved:

1. `aws login` (short-term credentials, us-east-1). No access keys.
2. Once per account: `npx cdk bootstrap aws://<account>/us-east-1`.
3. Build the parent app first if it should go out too (`parent-web/dist`; without it the bucket stays empty).
4. `npx cdk deploy --context stage=dev [--context budgetEmail=you@example.com]` (`npx cdk diff` first). Outputs: `ApiUrl`, `PwaUrl`, `UserPoolId`, `UserPoolClientId`, `CognitoDomain`.
5. `API=<ApiUrl> PARENT_TOKEN=<token> scripts/api-smoke.sh` with a token from signing in to the parent app.

Stage `dev` deletes its data with the stack (table, bucket, user pool); any other stage keeps them. The stack sets: on-demand table with TTL and GSI1; the Lambda (Node 22, arm64, esbuild); the HTTP API (stage throttled at 25 req/s, burst 50) with a Cognito JWT authorizer on parent routes; CORS for `http://localhost:5173` and the CloudFront URL; the user pool (email sign-in, self sign-up, email verification), an app client (no secret, code + PKCE, openid/email/profile) and a managed-login domain `marbletime-<stage>-<account>`; and the private bucket + CloudFront (SPA fallback). With `parent-web/dist` it uploads the app and a `config.json` with `{apiUrl, region, userPoolId, userPoolClientId, cognitoDomain}`. A $10/month budget alert is added only with `budgetEmail`.

## Data model

One table, `PK`/`SK`, GSI1 (`GSI1PK`/`GSI1SK`), TTL attribute `ttl`. The full key list is at the top of `src/repo/dynamo.ts`. Notes beyond docs/03 §7:

- **Claims** are `CLAIM#<id>`: the id is the TV's UUID, so a resend is a conditional put. GSI1 lists them per family (`W#…` while waiting, `D#<decidedAt>…` once decided), so the TV's state never reads old history.
- **"Once per day"** is a slot item, `SLOT#<child>#<job>#<day>` (or `#once`), taken in the same transaction as the claim, so two TVs can't both claim the same job at once.
- **Idempotency** records, `REF#<child>#<client id>`, store what an adjust or game result produced, so a repeat returns it (TTL 30 days).
- **Today's game marbles** are a counter on the child (`gameDay`, `gameMarbles`), updated with the GAME entry and the balance in one transaction. The update is conditional, so parallel results can't pass the cap.
- **Tokens:** GSI1 `TOKEN#<sha256>` sits on the device item. The token is made when the TV first polls after the parent confirmed, and only its hash is stored. GSI reads are eventually consistent, so a miss looks once more after 300 ms; a just-paired TV isn't turned away.

## Decisions on points the contract leaves open

- **Deciding twice.** The same decision again returns the claim unchanged (no second credit). The opposite decision on a decided claim is `409 already_decided`, from the parent app and from the TV.
- **Which day a claim is on.** It's the family-local date of the claim's `at` (the kid's own time, so a late outbox upload counts for the right day). If `at` is in the future or more than 7 days old, the server's time is used. A waiting or approved claim holds the day; a rejected or taken-back one frees it.
- **One-off jobs** ("gone once approved"). When a kid's claim is approved, the kid comes off the job; the job is deleted when nobody is left. A kid can't have a second waiting claim on it. Claiming a job you're not on is `409 not_on_board`.
- **Deleting a kid** deletes their ledger, claims and idempotency records and takes them off their jobs; a job left with nobody is deleted, so `Chore.childIds` never goes empty.
- **DELETE is idempotent:** 204 even when already gone (kids, jobs, TVs, claims).
- **Hand-off debt** is a running `debtSec` on the child. A PENALTY adds to it. Marking entries DONE pays the debt from those entries' minutes, because the parent added that much less; SKIPPED pays nothing.
  - `pendingMinutes = max(0, floor((Σ PENDING − debt) / 60))`.
  - CHORE, GAME and BONUS entries are PENDING whatever the TV's mode; the parent app decides when to show the hand-off.
  - Penalties are not hand-off entries (the PWA can show the debt as Σ entries − pendingMinutes).
  - Balances can go below zero.
- **Games.** Every posted result is a finished game: 2 marbles, capped by `dailyCapMarbles` minus the GAME marbles of the family's current local day (server time). `correct`/`total` are checked but don't change the reward. The topic isn't checked against the kid's topics, so a TV with stale settings doesn't lose marbles. The entry's `reason` is the topic.
- **Pairing.** After the token has been handed out, polls say `paired` without it. If the parent removed the TV before it fetched its token, the poll says `expired`. A waiting code past 10 minutes is `expired` (poll) or `410` (confirm). Codes are kept a day past expiry, then 404.
  - Confirming again from the same family returns the same TV with `200`; another family gets `409 already_paired`.
  - Codes are case-insensitive; a malformed one is `400`.
- **ETag** covers everything in DeviceState except `serverTime`, which changes every call and would make a 304 impossible.
- **Lists.** The TV's claims are all waiting ones plus those decided in the last 7 days (by `decidedAt`). `GET /claims` returns every waiting claim plus the 200 most recently decided (then filtered by `status`), newest first. Kids, jobs and TVs come oldest first.
- **lastSeen** is written by ordinary TV requests at most once a minute, and by every heartbeat (`appVersion` is stored, not exposed).
- **PIN on the TV.** After 5 wrong PINs within a minute on one TV, the next try gets `429 too_many_tries` with `Retry-After`, even with the right PIN. A family without a PIN gets `403 no_pin`.
- **Defaults.**
  - A new kid's games: numbers + puzzles up to age 6 (the built-in bank has word games only for 7+), all three topics from 7; cap 4. A missing `dailyCapMarbles` is 4.
  - Job colours rotate peach, mint, sky, lilac; gold stays for time and the main button.
  - Jobs repeat daily unless set otherwise.
  - Changing a title keeps the icon.
- **Text and ids.** Text is trimmed; lengths count characters, not bytes. Duplicate `childIds` collapse. Ids must match `^[A-Za-z0-9_-]{1,64}$` (UUIDs do).
- **`/me` email** comes from the token's `email` claim when there is one: ID tokens have it, Cognito access tokens don't.

## For the apps

- **Errors:** `{"error": {"code", "message"}}`. Codes:
  - `invalid` (400, message names the field), `invalid_json`
  - `unauthorized`, `unpaired` (401)
  - `wrong_pin`, `no_pin` (403)
  - `not_found`, `no_family` (404)
  - `method_not_allowed` (405)
  - `family_exists`, `already_claimed`, `not_on_board`, `not_today`, `already_decided`, `already_paired`, `id_in_use`, `busy` (409)
  - `expired` (410), `too_many_tries` (429, `Retry-After`)
- **TV:**
  - Send `Authorization: Device <token>`. Poll `GET /device/state` with `If-None-Match: <last ETag>`; a `304` has no body.
  - `401` means unpaired: start pairing again. If a pairing poll says `paired` without a token, the token was already handed out: start over.
  - Outbox: drop a request on 4xx other than 401 and 429; retry on 5xx and network errors.
  - Claims may name jobs that were deleted (use the claim's `choreTitle` and `minutes`). A balance can be negative (show an empty jar).
- **Parent app:**
  - Send `Authorization: Bearer <Cognito access or ID token>` for this app client.
  - Callback URLs `/` and `/callback`, logout `/`, on `http://localhost:5173` and the CloudFront URL.
  - After deploy, `GET /config.json` on the app's own origin has the API and Cognito settings.
  - Pair page `/pair/:code` → `POST /pairings/{code}/confirm`: `201` new TV, `200` already yours, `404`, `410` expired, `409` someone else's.
  - CORS allows `authorization`, `content-type`, `if-none-match` and exposes `etag`.
