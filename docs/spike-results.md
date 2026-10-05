# Day-1 check results (M0)

The checks are defined in [04 · M0](04-implementation-plan.md#m0--setup-and-day-1-checks-oct-56).

| # | Check | Result | Date | Notes |
|---|---|---|---|---|
| K1 | Amazon Kids daily limit on the 4K Plus | pending (you) | | |
| K2 | Bonus time from the Parent Dashboard unlocks it | pending (you) | | |
| K3 | TimeJar in the kid profile; usable after time's up | pending | | |
| R1 | Expo TV build runs on Fire OS 8 (32-bit) with D-pad focus | pending (needs the stick's IP) | | |
| R2 | Vega build runs on the Vega Virtual Device | ✅ pass | 2026-10-05 | The starter builds (`yarn vega:build`), installs and launches on the VVD; D-pad keys via `inputd-cli` move focus; `scripts/vega.sh shot` captures the window. Needed `tv/vega-sdk-requirements.json` bumped from 0.24.9914 to the installed 0.24.12112 (friction log). |
| R3 | Text-to-speech on the stick | pending (needs the stick) | | |
| S1–S6 | Strict-mode spike | pending (needs the stick) | | |
