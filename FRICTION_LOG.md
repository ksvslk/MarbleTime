# Friction log

One entry per real snag with an Amazon tool or doc: task · steps · expected vs actual · severity · workaround · suggestion.

## 2026-10-05 · Vega SDK installer output when run unattended

- **Task:** install the Vega SDK 0.24 and the Vega Virtual Device on an Apple Silicon Mac, driven by a coding agent.
- **Steps:** `NONINTERACTIVE=true bash get_vvm.sh > install.log 2>&1` (the installer script from `sdk-installer.vega.labcollab.net`).
- **Expected:** a short log with one line per step.
- **Actual:** the install worked (SDK 0.24.12112, CLI 1.4.2), but the progress bars redraw with carriage returns, so the captured log was **2.5 MB** and the result lines were buried. `NONINTERACTIVE` is only discoverable by reading the script.
- **Severity:** low.
- **Workaround:** `tr '\r' '\n' < install.log | grep -v '\['` to read it.
- **Suggestion:** disable progress bars when stdout isn't a TTY or when `NONINTERACTIVE=true`, and document `NONINTERACTIVE` / `SKIP_SDK_INSTALL` / `VEGA_SDK_VERSION` in the install guide.

## 2026-10-05 · The multi-TV starter pins an exact Vega SDK patch version

- **Task:** build `AmazonAppDev/react-native-multi-tv-helloworld` for the Vega Virtual Device right after installing the SDK.
- **Steps:** install the SDK with the official installer (it installs the latest, 0.24.12112) → `yarn vega:build` in the starter.
- **Expected:** the build uses the installed 0.24 SDK.
- **Actual:** the starter's `vega-sdk-requirements.json` pins `0.24.9914`. Metro bundling succeeds, then the native step fails: `SDK availability check — SDK version main@0.24.9914 is not installed`. Every `vega` command run inside the repo fails the same way, even `vega virtual-device --help`.
- **Severity:** medium (blocks the first build; the message doesn't say where the version comes from).
- **Workaround:** set `vegaSdkVersion` to `0.24.12112` in `vega-sdk-requirements.json`. Build, install and launch then work.
- **Suggestion:** accept compatible patch versions (a semver range), name the file the requirement came from in the error, and let help commands run without the check.
