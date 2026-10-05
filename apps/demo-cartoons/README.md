# Demo Cartoons

A tiny Fire OS app that plays a Creative Commons cartoon full screen: the "video app" that MarbleTime's strict
mode meters and locks in tests and in the demo video, so no real streaming service appears on camera.

- Video: *Big Buck Bunny* © 2008 Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/),
  streamed from Wikimedia Commons (480p VP9). The credit shows on screen for the first seconds.
- Remote: OK or play/pause pauses and resumes.

Build and install (same toolchain as the TV app):

```bash
cd apps/demo-cartoons
ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home ./gradlew assembleRelease
adb -s <stick> install -r app/build/outputs/apk/release/app-release.apk
```
