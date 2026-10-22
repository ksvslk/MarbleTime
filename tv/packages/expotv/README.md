# MarbleTime on Fire OS

The Fire OS build of the TV app: Expo with the React Native TV fork
([react-native-tvos](https://github.com/react-native-tvos/react-native-tvos)). The screens and the rules are in
[`../shared`](../shared); `app/index.tsx` shows them. This package adds what only Android has:

- `modules/marble-strict`: strict mode, a Kotlin Expo module. A foreground service sees which app is in front (usage
  stats) and puts the lock screen over it. Its rules are in an engine with unit tests (docs/03 §5).
- `modules/marble-audio`: the app's sounds, the read-aloud clips and the characters' lines (SoundPool and a player
  queue).

Build, install and run it with `scripts/fire.sh` from the repository root, as the [README](../../../README.md#run-it)
says. The first `scripts/fire.sh build` makes the Android project (`android/`) with `expo prebuild`; it isn't kept in
git.
