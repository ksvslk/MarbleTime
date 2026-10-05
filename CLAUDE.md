# TimeJar: earned screen time on Fire TV (hackathon, deadline 2026-10-23 12:00 PDT)

Kids earn TV time with real-life jobs (written by parents) and brain games (written by AI, checked by code).
Docs: docs/ (README first; architecture docs/03, incl. §11 brain games and §12 TV design rules; plan docs/04; API ask docs/07).
TV design canvas: https://claude.ai/artifact/7Fs9Pa4bPtV1vzPfF2wLxh
API contract (from M2): backend/openapi.yaml.

## Modes
amazon_kids (Appstore, Fire OS + Vega) · strict (Fire OS sideload, Kotlin module) · api_mock (proposed Earned Time API)

## Layout
- tv/ — React Native monorepo (Yarn 4 workspaces), from AmazonAppDev/react-native-multi-tv-helloworld (MIT-0)
  - tv/packages/shared — screens and logic shared by both builds (*.android.tsx / *.kepler.tsx for platform bits)
  - tv/packages/expotv — Fire OS build (Expo TV / react-native-tvos)
  - tv/packages/vega — Vega build (Vega SDK, manifest.toml)
- backend/ — AWS CDK + Lambda (M2) · parent-web/ — parent PWA (M2) · scripts/ — device loops

## Commands
- Install: cd tv && yarn install   (Yarn 4 via Corepack; shims live in ~/.local/bin)
- Vega: source ~/vega/env, then scripts/vega.sh build|start|run|keys|shot|logs   (Vega Virtual Device)
- Fire OS: scripts/fire.sh connect|install|launch|keys|shot|logs   (stick address in .env.local FIRETV=<ip>:5555)
- Backend (M2): cd backend && npm test && npx aws-cdk deploy --context stage=dev
- AWS: credentials come from `aws login` (short-term, region us-east-1). If a command fails with expired credentials, ask the user to run `aws login`; don't create access keys (the user declined).

## Rules
- Verify every TV change on the stick or the VVD (screenshot or log check) before saying it's done.
- Follow the TV design rules in docs/03 §12: marbles = 5 min, gold only for time and the main button, white ring only for focus, one row, few words.
- Shared code stays platform-neutral; platform bits go in *.android.tsx / *.kepler.tsx.
- Ledger/hand-off/strict-engine/brain-game-checker changes need unit tests. Contract changes: openapi.yaml first.
- Log every tool/doc snag in FRICTION_LOG.md as it happens. No secrets or real kids' photos in git.
- Never copy code from bageshwar/screentamer-tv (no license).
