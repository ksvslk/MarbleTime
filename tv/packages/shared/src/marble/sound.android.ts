import {Image} from 'react-native';
import {SFX, SfxName} from './sfx';
import type {LineEvent} from './sound';

// The native SoundPool module lives in the Fire OS app (tv/packages/expotv/modules/marble-audio).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native: {
  preload(uris: string[]): void;
  play(uri: string, volume: number): void;
  speak(uris: string[]): void;
  enqueue(uris: string[]): void;
  stopSpeaking(): void;
  addListener(event: 'onLine', listener: (event: LineEvent) => void): {remove(): void};
} | null = (() => {
  try {
    return require('expo-modules-core').requireOptionalNativeModule('MarbleAudio');
  } catch {
    return null;
  }
})();

const uriOf = (source: number) => Image.resolveAssetSource(source)?.uri ?? '';
/** A recorded clip (an asset id) or an https URL (a line the backend made). */
const toUri = (line: number | string) => (typeof line === 'number' ? uriOf(line) : line);

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
  /** Read-aloud lines, one after another (MediaPlayer in the module). */
  speak(lines: (number | string)[]): void {
    try {
      native?.speak(lines.map(toUri));
    } catch {
      // Silence is fine.
    }
  },
  /** Lines after what is being said now, without cutting it off (the rest of the read-aloud, a character's line). */
  enqueue(lines: (number | string)[]): void {
    try {
      native?.enqueue(lines.map(toUri));
    } catch {
      // Silence is fine.
    }
  },
  /** Each line as it starts and ends playing: a character's mouth moves with its own line. */
  onLine(listener: (event: LineEvent) => void): () => void {
    try {
      const sub = native?.addListener('onLine', listener);
      return () => sub?.remove();
    } catch {
      return () => {};
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
