# parent-web

The MarbleTime parent app: a mobile-first PWA (React + Vite + TypeScript). Grown-ups approve jobs, give or take
time, hand earned time to Amazon Kids, set each kid's daily budget, edit jobs, make the kids' characters, pair TVs
and change settings. It talks to the API in
[`backend/openapi.yaml`](../backend/openapi.yaml); the look follows the TV ([docs/03 §12](../docs/03-architecture.md#12-tv-design-rules)).

## Run it

```sh
cd parent-web
npm install
npm run dev -- --host     # http://localhost:5173, and http://192.168.0.100:5173 for a phone on the same Wi-Fi
```

`.env.development` points at the backend's local dev server (`http://192.168.0.100:8787`, `cd backend && npm run dev`)
and turns on **dev sign-in**: type a name, and every request carries `Authorization: Bearer dev-<name>` (the name in
lowercase a–z, 0–9 and dashes, so any name fits in a header: "Õie Mai" → `dev-oie-mai`). A different API for one run:
`VITE_API_URL=http://localhost:8788 npm run dev`.

| `npm run …` | |
|---|---|
| `dev` | Vite dev server on port 5173. The port is fixed (`strictPort`): it is the origin the backend allows. |
| `build` | Type-check, then build to `dist/` (the CDK stack uploads it to S3 + CloudFront). |
| `test` | Vitest: marbles and minutes, the daily budget, jobs, approval results, the character flow (against contract-shaped answers), the WAV conversion, translations, the API client, config, icons, and a check that `src/api/schema.ts` still matches `backend/openapi.yaml`. |
| `gen:api` | Regenerate `src/api/schema.ts` from the contract (openapi-typescript). Run it after every contract change. |
| `icons` | Redraw the PWA icons from the jar logo (needs `rsvg-convert`: `brew install librsvg`). |

## Configuration for a real build

Set at build time as Vite env, or at run time in a `/config.json` next to `index.html` (it wins). Nothing here is
secret: the Cognito app client is public (PKCE, no client secret). `.env.example` has the shape; real values go in
`.env.production.local` (git-ignored) or the shell. With `config.json` the CDK stack can write the values it just
created (`s3deploy.Source.jsonData('config.json', {...})`), so one build serves any stage.

| Vite env | `config.json` key | |
|---|---|---|
| `VITE_AUTH` | `auth` | `cognito` (default) or `dev` |
| `VITE_API_URL` | `apiUrl` | API base URL |
| `VITE_COGNITO_AUTHORITY` | `cognitoAuthority` | `https://cognito-idp.us-east-1.amazonaws.com/<poolId>` |
| `VITE_COGNITO_CLIENT_ID` | `cognitoClientId` | the app client id |
| `VITE_COGNITO_DOMAIN` | `cognitoDomain` | managed login domain, for signing out (`https://<prefix>.auth.us-east-1.amazoncognito.com`) |
| `VITE_REALTIME_URL` | `realtimeUrl` | optional: the live-updates WebSocket (`wss://…`); without it the app polls |

The stack's own key names work too: `region` + `userPoolId` make the authority, `userPoolClientId` is the client id.
A build without them shows "This app isn't set up yet" with the missing names.

## What the backend and hosting must match

- **Cognito:** a public app client with the authorization code grant + PKCE, scopes `openid email`, and a managed login
  domain. Callback URL `https://<app>/auth/callback`, sign-out URL `https://<app>/` (plus the `http://localhost:5173`
  versions for local tests; Cognito allows plain http only for localhost, which is why the LAN dev setup uses dev sign-in).
  The app sends the **access token**, so the API's JWT authorizer must accept access tokens (audience = the client id;
  API Gateway checks their `client_id` claim). Managed login is asked for `lang=en|de|es` (it has no Estonian).
- **CORS:** allow the app's origin (and `http://localhost:5173`, `http://192.168.0.100:5173` in dev), headers
  `Authorization` and `Content-Type`, methods `GET, POST, PATCH, DELETE, OPTIONS`. No cookies are used.
- **`POST /speech-to-text`** gets a binary body (`Content-Type: audio/wav`: RIFF header, PCM, mono, 16 kHz, 16-bit,
  at most 15 s = 480,044 bytes). API Gateway hands it to Lambda base64-encoded. Transcribe streaming takes raw PCM
  (`MediaEncoding: pcm`), so skip the 44-byte header.
- **Pairing link:** the TV's `pairUrl` is `<app URL>/pair/<code>` (dev: `http://192.168.0.100:5173/pair/<code>`).
- **SPA hosting:** unknown paths (`/pair/…`, `/auth/callback`, `/kids/…`) must return `index.html` with status 200
  (CloudFront error responses for 403/404, or a viewer-request function). `index.html`, `sw.js`,
  `manifest.webmanifest` and `config.json`: `Cache-Control: no-cache`. `assets/*`: immutable (their names change
  with every build). The app registers `sw.js` with `updateViaCache: 'none'`, so browsers check it past their cache.
- **Status codes the app acts on:** 401 → renew the token once (refresh token), then sign in again; 404 / 410 from
  `POST /pairings/{code}/confirm` → "This code doesn't work" / "This code has expired"; 409 from approve/reject →
  "Someone already decided"; 409 `empty_jar` from `POST /children/{id}/adjust` → "Nothing earned to take away" (and
  the kid's time is fetched again); 409 from `POST /family` → the family exists, onboarding carries on; 422
  `idea_not_ok` from `POST /children/{id}/characters` → its `message` is shown as "Read this to your kid:", the words
  stay to edit; 409 `no_tokens` → "No new character to make right now"; 413 from `POST /speech-to-text` → "That was
  too long"; 404 from `GET /children/{id}/characters` (a server without the route yet) → no characters.
- **Live updates** (`x-realtime`): one WebSocket per open app, `<realtimeUrl>?token=<access token>` (a fresh token
  on every reconnect), a `{"type":"ping"}` every 5 minutes, reconnects with backoff (1 s doubling to 30 s, ±20 %).
  On `{"type":"changed"}` the app fetches the family, and what the screen shows (claims, a kid's history, hand-off
  and characters) at once; a burst of messages within 250 ms is one fetch.
- **Load:** `GET /claims?status=waiting` every 3 s while the approvals page is visible and there's no live
  connection; every 30 s while there is (paused when the phone hides the page). `GET /children/{id}/handoff` per kid
  on that page (on load, on changes, every 30 s). `GET /children/{id}/characters` on the kid's page and while making
  a character: on load, on changes, every 3 s while one is drawing and there's no live connection (30 s with one),
  otherwise every 60 s.
- **Notifications** (Web Push): the service worker shows the server's `{"title", "body", "data": {"url", "claimId"}}`
  with `tag: claimId` and opens or focuses the app at `data.url` on a tap. The app subscribes with `GET /push/key`
  and `userVisibleOnly`, sends `POST /push/subscriptions` (again on each start, as endpoints can change) and
  `DELETE` when switched off. Push needs https: not on the LAN dev address.
- `GET /me` may leave out `parent.email` (Cognito access tokens don't carry it); Settings then shows the email from
  the ID token.

## Decisions on things the contract leaves open

- **Amazon Kids hand-off** shows when any TV is in `amazon_kids` mode, or before any TV is paired (the default
  mode). It appears on the kid's page and under the approvals, since right after "Yes" is when grown-ups add the time.
  "I added it" marks exactly the `PENDING` entries that were shown as `DONE` (200 per request); anything approved in
  between stays pending. `SKIPPED` isn't offered. No card when `pendingMinutes` is 0.
- **The daily budget** (docs/08 §1): every kid has a jar, shown as a place per marble (the free ones gold, the ones
  jobs fill empty) and as "30 min free + 30 min from jobs = 60 min a day". Its size is `dailyMaxMin` (10-minute
  steps, at most 60 under 7 and 120 from 7, with the health guidance in one line under it); the free base
  `dailyBaseMin` is 0 to the ceiling, "Free every day; jobs fill the rest of the jar". It is in onboarding's first
  kid, the kid form and its own card on the kid's page (saved as the grown-up taps; both values in one `PATCH`).
  Every change is made to fit the age; lowering the ceiling below the base lowers the base too.
- **New kids** get the age's budget, sent explicitly: 60 minutes under 7, 90 from 7, half of it free in whole
  marbles, rounding up (90 → 50 free, 40 to earn: within docs/08's "a third to a half earnable"). Until the grown-up
  touches the budget, changing the age moves it to that age's defaults; after that, and for existing kids, a new age
  only clamps it (as the server does).
- **New jobs** send no `icon`, so the server picks one from the title ("Auto"); once a job has an icon it can be
  changed but not reset to auto (`ChorePatch` can't unset it). New jobs take turns through peach, mint, sky and lilac.
  "Some days" starts as Mon–Fri. A new job is worth one marble.
- **A job's value** is one of three choices, 1, 2 or 3 marbles (10–30 minutes). A job saved with other minutes (from
  when a marble was 5 minutes) is rounded into that range when it's opened. **Routine** is a switch with "For jobs
  your kid already does regularly: praised, no marble"; while it's on the marbles are hidden (and kept, for when it's
  turned off), and the job shows a heart instead of marbles on the job list, the preview and the approvals.
- **TV mode** can be changed per TV; `strict` is offered only for `fireos` (the Kotlin module exists only there).
- **The base in Amazon Kids mode** isn't handed off: the text under it says Amazon Kids needs the same daily limit,
  with a link to parents.amazon.com. A kid's time always shows the base apart from what was earned: "30 min every
  day" and "+ 30 min earned" (the marbles are only the earned part).
- **Positive first:** "Give minutes" is the main card with the gold button. "Take away minutes" is a smaller button
  under it that opens its own form. Both step by a marble (10 minutes). It can take at most what was earned, in
  whole marbles (less than 10 earned minutes can't be taken), and is greyed out with "Nothing earned to take away"
  when the jar is empty. Both need a
  reason; the take-away form says the TV shows the kid the reason. The toast reports what the server actually took.
- **± time** sends a client UUID `id`; a retry of the same change after a network error keeps it, so it counts once.
  The reason is trimmed, ≤ 80 characters.
- **Not yet** = `POST /claims/{id}/reject`. After **Yes**, a note says what the approval gave, from the claim the
  server returns: "Mia +2 marbles" (`minutesCredited`, which can be less than the job when the jar was nearly full;
  part of a marble is said in minutes), "Jar was full: Mia earned a new character", or "Mia: routine job, praised". A
  server that doesn't send `reward` gets the old "+20 min".
- **The grown-up's name as kids see it** ("Dad", "Ema": `PATCH /me`) is the first card in Settings, with where it
  shows ("You fed Rex! – Dad" on the TV), and an optional field in onboarding's family step, sent right after
  `POST /family`; if that fails, onboarding carries on (it can be set in Settings).
- **Characters** (docs/08, Decisions 4–5): while a kid has `characterTokens`, a card "Make Mia's new character" sits
  on Approvals and on the kid's page, and the Kids list shows a "New character" badge. It opens
  `/kids/<id>/character`: a big mic button records up to 15 s (MediaRecorder, then the Web Audio API decodes it and
  `lib/wav.ts` resamples it with a windowed-sinc low-pass to 16 kHz mono 16-bit PCM WAV for `POST /speech-to-text`);
  the words land in a text box the grown-up can edit, or type into instead ("Characters understand English for
  now"). Recording needs https (or localhost): on the LAN dev address the screen says to type. "Draw it" sends
  `POST /children/{id}/characters`; 422 shows the server's sentence to read to the kid; 202 shows "Drawing… (about half
  a minute)" and follows the character (live updates, polling as the backup) to ready (the art, large, with its name)
  or `needs_help` ("couldn't be drawn, so the new character is back to make" and "Try other words", with the words).
  The kid's page lists their characters, newest first; removing one asks first and says no new character is given
  back (for a failed try: only the try goes). The art is always an `<img src="data:image/svg+xml,…">` (scripts in it
  can't run, and it never becomes part of the page); a missing SVG namespace is added so it draws.
- **History** shows the last 50 ledger entries in whole minutes (a part-minute taken counts as a minute).
- **Language:** the family's (from the server) once signed in; before that the browser's first supported one.
- **Brain games are gone** (docs/08, Decisions 1): no game settings and no question preview. Old `GAME` entries
  still show in a kid's history.
- Docs mention per-kid "read aloud"; it isn't in the contract, so the app has only the family-wide "Read aloud" switch.

## Notes

- **Service worker: notifications only.** `public/sw.js` has no fetch handler and no cache, so it can never serve
  an old build after a deploy, and it takes over at once when it changes. On iPhone, notifications need MarbleTime
  added to the Home Screen (iOS 16.4+); the app says so where the switch would be.
- **Sign-in persists** on the phone: oidc-client-ts keeps the Cognito tokens in localStorage and renews the access
  token with the refresh token when it is about to expire. The page loads no third-party scripts.
- **Fonts:** the system's rounded face where there is one (`ui-rounded` on iPhone), like the TV app's system font;
  no web fonts, so no third-party requests.
- **Icons and avatars** are the TV's own SVG, copied once from `scripts/make-icons.py` into `src/icons.ts`; most job
  icons are Lucide (ISC, see `THIRD_PARTY_NOTICES.md`). The phone's own few (mic, stop, arrows) are plain shapes drawn
  here. Colours come from `src/tokens.ts`, a copy of the TV's tokens; one marble is 10 minutes.
- **Translations** (English, Estonian, German, Spanish) are one table, `src/i18n/strings.ts`; a test checks that every
  language has every key and the same `{holes}`. **Estonian, German and Spanish were written by the agent: have a
  native speaker review them.** Where the phone names a TV button, it uses the TV's own words.

## Layout

```
src/
  main.tsx, App.tsx      bootstrap; the gates: config → signed in → family exists → screens
  config.ts              Vite env + optional /config.json
  api/                   schema.ts (generated from the contract), types.ts (names), client.ts (fetch + ApiError)
  auth/                  Cognito managed login (oidc-client-ts, code + PKCE) and dev sign-in, one interface
  i18n/                  the translation table and the language context
  lib/                   pure helpers (formatting, checks, ids, the daily budget, jobs, approval results, characters,
                         WAV), the recorder (browser-only) and hooks (polling, autosave)
  live/                  live updates: the WebSocket client and the hook screens use to refetch
  push/                  Web Push: permission, subscribe/unsubscribe, and the shared switch state
  screens/               sign-in, onboarding, approvals + hand-off, kids + budget, characters, jobs, TVs, pairing, settings
  ui/                    icons, marbles, avatars, job tiles, form controls, dialogs, toasts, tab bar
  tokens.ts, icons.ts    copies of the TV's colours and pictures
public/sw.js                the service worker (notifications only)
scripts/make-pwa-icons.ts   public/favicon.svg, the PNG icons and the notification badge, from the logo
```
