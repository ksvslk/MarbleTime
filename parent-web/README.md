# parent-web

The MarbleTime parent app: a mobile-first PWA (React + Vite + TypeScript). Grown-ups approve jobs, give or take
time, hand earned time to Amazon Kids, edit kids and jobs, pair TVs and change settings. It talks to the API in
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
| `test` | Vitest: marbles and minutes, repeat summaries, translations, API client errors, config, icons, and a check that `src/api/schema.ts` still matches `backend/openapi.yaml`. |
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

A build without them shows "This app isn't set up yet" with the missing names.

## What the backend and hosting must match

- **Cognito:** a public app client with the authorization code grant + PKCE, scopes `openid email`, and a managed login
  domain. Callback URL `https://<app>/auth/callback`, sign-out URL `https://<app>/` (plus the `http://localhost:5173`
  versions for local tests; Cognito allows plain http only for localhost, which is why the LAN dev setup uses dev sign-in).
  The app sends the **access token**, so the API's JWT authorizer must accept access tokens (audience = the client id;
  API Gateway checks their `client_id` claim). Managed login is asked for `lang=en|de|es` (it has no Estonian).
- **CORS:** allow the app's origin (and `http://localhost:5173`, `http://192.168.0.100:5173` in dev), headers
  `Authorization` and `Content-Type`, methods `GET, POST, PATCH, DELETE, OPTIONS`. No cookies are used.
- **Pairing link:** the TV's `pairUrl` is `<app URL>/pair/<code>` (dev: `http://192.168.0.100:5173/pair/<code>`).
- **SPA hosting:** unknown paths (`/pair/…`, `/auth/callback`, `/kids/…`) must return `index.html` with status 200
  (CloudFront error responses for 403/404, or a viewer-request function). `index.html`, `manifest.webmanifest` and
  `config.json`: no-cache. `assets/*`: immutable.
- **Status codes the app acts on:** 401 → renew the token once (refresh token), then sign in again; 404 / 410 from
  `POST /pairings/{code}/confirm` → "This code doesn't work" / "This code has expired"; 409 from approve/reject →
  "Someone already decided"; 409 from `POST /family` → the family exists, onboarding carries on.
- **Load:** `GET /claims?status=waiting` every 3 s while the approvals page is visible (paused when the phone hides
  the page), and `GET /children/{id}/handoff` per kid on that page (on load, after decisions, every 30 s).
- `GET /me` may leave out `parent.email` (Cognito access tokens don't carry it); Settings then shows the email from
  the ID token.

## Decisions on things the contract leaves open

- **Amazon Kids hand-off** shows when any TV is in `amazon_kids` mode, or before any TV is paired (the default
  mode). It appears on the kid's page and under the approvals, since right after "Yes" is when grown-ups add the time.
  "I added it" marks exactly the `PENDING` entries that were shown as `DONE` (200 per request); anything approved in
  between stays pending. `SKIPPED` isn't offered. No card when `pendingMinutes` is 0.
- **New kids** start with all three topics and 4 game marbles a day (docs/03 §11), sent explicitly.
- **New jobs** send no `icon`, so the server picks one from the title ("Auto"); once a job has an icon it can be
  changed but not reset to auto (`ChorePatch` can't unset it). New jobs take turns through peach, mint, sky and lilac.
  "Some days" starts as Mon–Fri.
- **TV mode** can be changed per TV; `strict` is offered only for `fireos` (the Kotlin module exists only there).
- **± time** sends a client UUID `id`; a retry of the same change after a network error keeps it, so it counts once.
  The reason is required (trimmed, ≤ 80).
- **Not yet** = `POST /claims/{id}/reject`.
- **History** shows the last 50 ledger entries; minutes are whole (a part-minute of debt shows as a minute owed).
- **Language:** the family's (from the server) once signed in; before that the browser's first supported one.
- Docs mention per-kid "read aloud" and a preview of the day's questions; neither is in the contract yet, so the app
  has only the family-wide "Read aloud" switch.

## Notes

- **No service worker.** The app installs from the manifest (Android Chrome and iOS "Add to Home Screen"); a cache
  would risk a stale app after deploys and could get in the way of the sign-in redirect. Worth adding only if
  offline approvals become a goal.
- **Sign-in persists** on the phone: oidc-client-ts keeps the Cognito tokens in localStorage and renews the access
  token with the refresh token when it is about to expire. The page loads no third-party scripts.
- **Fonts:** the system's rounded face where there is one (`ui-rounded` on iPhone), like the TV app's system font;
  no web fonts, so no third-party requests.
- **Icons and avatars** are the TV's own SVG, copied once from `scripts/make-icons.py` into `src/icons.ts`; most job
  icons are Lucide (ISC, see `THIRD_PARTY_NOTICES.md`). Colours come from `src/tokens.ts`, a copy of the TV's tokens.
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
  lib/                   pure helpers (formatting, checks, ids) and hooks (polling, autosave)
  screens/               sign-in, onboarding, approvals + hand-off, kids, jobs, TVs, pairing, settings
  ui/                    icons, marbles, avatars, job tiles, form controls, dialogs, toasts, tab bar
  tokens.ts, icons.ts    copies of the TV's colours and pictures
scripts/make-pwa-icons.ts   public/favicon.svg and the PNG icons from the logo
```
