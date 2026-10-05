import {Image} from 'react-native';
import {SFX, SfxName} from './sfx';

// The native SoundPool module lives in the Fire OS app (tv/packages/expotv/modules/marble-audio).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native: {preload(uris: string[]): void; play(uri: string, volume: number): void; speak(uris: string[]): void; stopSpeaking(): void} | null = (() => {
  try {
    return require('expo-modules-core').requireOptionalNativeModule('MarbleAudio');
  } catch {
    return null;
  }
})();

const uriOf = (source: number) => Image.resolveAssetSource(source)?.uri ?? '';

/** Fire OS: effects through SoundPool, read-aloud through MediaPlayer (MarbleAudio; no media session). */
export const Sound = {
  preload(): void {
    native?.preload(Object.values(SFX).flat().map(uriOf));
  },
  play(name: SfxName, volume = 1): void {
    try {
      const variants = SFX[name];
      native?.play(uriOf(variants[Math.floor(Math.random() * variants.length)]), volume);
    } catch {
      // A missing sound must never break the app.
    }
  },
  /** Read-aloud clips, one after another (MediaPlayer in the module). */
  speak(clips: number[]): void {
    try {
      native?.speak(clips.map(uriOf));
    } catch {
      // Silence is fine.
    }
  },
  stopSpeaking(): void {
    try {
      native?.stopSpeaking();
    } catch {
      // Silence is fine.
    }
  },
};
