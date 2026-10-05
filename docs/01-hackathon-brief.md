# 01 · Hackathon brief: what the rules mean for this project

Source: <https://amazonappdev2026.devpost.com> (overview, rules, resources, FAQ, updates), read 2026-10-02.

## Key dates

| What | Official time | Your time (EEST, UTC+3) |
|---|---|---|
| **Submission deadline** | **Fri Oct 23 2026, 12:00 PDT** | **Fri Oct 23, 22:00** |
| AWS credits request ($150 per person, every teammate can ask) | by Oct 21, 12:00 PT | Oct 21, 22:00 |
| Judging | Oct 26 (dates page) / Nov 9 (rules) → Nov 20 | |
| Winners announced | ~Dec 3 2026 | |

**You have 21 calendar days from today (Oct 2).** Keep any cloud backend running until **Nov 20** in case judges test the app.

## Fire TV track: what is required

- The app must be "demo-ready" and run on **Fire OS or Vega OS**. Any framework is allowed (Kotlin/Java, React Native, web).
- The demo video must show it running on a **real Fire TV device or the Fire TV/Vega simulator**. Your **Fire TV Stick 4K Plus (Fire OS 8)** qualifies.
- **The app does not need to be published to the Appstore.** Sideloading over ADB is fine for the hackathon. The "Potential Impact" score still asks whether it *could* reach real users (see 02-approaches).
- Priority categories: AI-enhanced viewing, sports, fitness, **family entertainment**, **multi-modal UX**, **computer vision**.
  This idea fits *family* and *multi-modal* (TV + phone + optionally voice) well. *(Photo-verified chores, the computer-vision angle, were dropped on Oct 5. AI-written learning games strengthen the family angle instead.)*
- Judges' own examples:
  - *Obvious:* basic streaming UI, simple video player, remote-controlled game.
  - *Creative:* AI viewing that adapts to household patterns, CV fitness, **multi-modal UX combining voice + D-pad + visuals in one flow**.

## How judging works

1. **Stage 1 (pass/fail):** does the project fit the theme and reasonably use the required APIs/SDKs?
2. **Stage 2:** four equally weighted criteria, each scored 1–5. Ties are broken in this order:

| Criterion | What it means for us |
|---|---|
| Tech Implementation | One React Native codebase running on **Fire OS and Vega**, built on Amazon's starter and Builder Tools. Strict mode that really works on a real Fire TV. A solid sync/ledger design on AWS. |
| Design | One coherent flow between the kid on the TV and the parent on the phone. TV-native focus navigation, big readable UI, a fun celebration when minutes are earned. |
| Potential Impact | A specific customer case: screen-time fights in families. **The core can ship on the Appstore today** (Amazon Kids mode, Fire OS + Vega). Strict mode is clearly labelled as a prototype. |
| Quality of the Idea | Not "a timer app": *Learn First, generalized to real life*. The multi-modal loop (TV ↔ phone ↔ AI/voice), plus a concrete **Earned Time API** proposal ([07](07-earned-time-api.md)), which is the "Shape" feedback the hackathon wants. |

**Bonus: up to +10%** for **friction log** entries. We will keep `FRICTION_LOG.md` as we build (see 05-agent-playbook).

## Submission checklist

- [ ] Text description (what it does and how it works)
- [ ] GitHub repo with all source, assets and **setup/run instructions**. Pick one:
  - public, with an OSI license that GitHub detects (shown in the About box), **or**
  - private, with collaborators `chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar` and `testing@devpost.com`. **Invites expire after 7 days**, so send them close to submission.
- [ ] Demo video **< 3 min**, public on YouTube/Vimeo, in English, showing the app on the Fire TV
  - ⚠️ **No third-party trademarks or copyrighted footage** without permission. Don't film Netflix/Disney content or linger on their logos. Use a demo "cartoon" app playing CC-licensed video (e.g. Blender's *Big Buck Bunny*, CC-BY) as the app whose minutes are being counted.
- [ ] **Product feedback** for every tool/API/SDK used: what for, what worked, what needs work, onboarding experience, would you build again. AWS usage must be described here for the AWS Builder mini-challenge.
- [ ] Track(s) and mini-challenge(s) selected
- [ ] Optional: feature requests (Critical / Important / Nice-to-have)
- [ ] Optional, **worth up to +10%**: friction log entries (task, steps, expected vs actual, severity, workaround, suggestion)
- [ ] If entering Open Source: contribution URL, repo URL, GitHub username and description

## Prizes relevant to us

| Prize | Cash | Extras |
|---|---|---|
| Fire TV 1st / 2nd / 3rd | $25k / $15k / $4k | $15k / $5k / $1k AWS credits |
| AWS Builder mini-challenge | $5k | $5k AWS credits |
| Open Source mini-challenge | $5k | $5k AWS credits |
| Alexa+ 1st / 2nd / 3rd | $25k / $15k / $4k | AWS credits |

**AWS Builder note:** the rules say building with *Kiro Crew* (AWS's open-source agent orchestrator, Aug 2026) qualifies on its own. Its first release runs on AWS's Kiro CLI, not Claude Code, so we qualify by using AWS services in the product instead: Lambda, DynamoDB, Cognito and Bedrock, documented in the feedback answer.

A project can win **one track prize + one mini-challenge prize**. The submission form allows several primary tracks, so a chores MCP server could also enter the Alexa+ track (optional, see 02-approaches §7).

## Resources and how useful each one is

| Resource | Useful? | Notes |
|---|---|---|
| **Amazon Devices Builder Tools** (MCP server + Agent Skills) | ✅ Yes | Vega-first skills (setup, build-and-run, focus, navigation, UI) plus Fire OS docs. Setup is in 05 §4. |
| Fire TV / Fire OS docs and Vega docs | ✅ Yes | D-pad/focus guidelines, ADB, device specs, Vega CLI and simulator |
| `AmazonAppDev/react-native-multi-tv-helloworld` | ✅ **Base for our TV app** | Yarn monorepo: shared package + Expo TV (Android → Fire OS) + Vega app |
| `react-native-multi-tv-app-sample` | ◻️ UI parts to borrow | Drawer, grids, settings screens. Its Vega app is on an older RN. |
| `AmazonAppDev/hello-world-fire-tv` (Kotlin + Compose) | ◻️ Reference / fallback | Android patterns for the strict-mode module; the Kotlin-only fallback |
| Vega samples (`vega-tv-interfaces-sample`, …) | ◻️ Reference | Focus, i18n, navigation patterns on Vega |
| Developer forums (Fire apps, Vega) | ✅ For blockers | Also a source of friction-log material |
| AWS Builder Center, $150 credits form | ✅ Yes | Request credits **this week** |
| Alexa+ track docs (MCP 2025-11-25, Streamable HTTP) | ◻️ Optional | The gated Alexa+ tools are **not** available to participants (FAQ), so the Alexa+ experience is simulated in a web app |
| Ring APIs | ◻️ Stretch only | OAuth account linking, motion/person webhooks and snapshots could auto-verify outdoor chores. Needs a real device and app approval, so not in the MVP. |
| Bee wearable | ❌ | Not relevant |
| Live office hours, YouTube build session | ✅ | Ask about Fire OS enforcement APIs and a screen-time API for Vega |
