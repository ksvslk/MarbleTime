import type {SfxName} from './sfx';

/**
 * Sound effects and read-aloud clips. Platform files implement it: sound.android.ts (Fire OS, our
 * MarbleAudio module) and, later, sound.kepler.ts (Vega). This default is silent (tests, other platforms).
 */
export const Sound = {
  preload(): void {},
  play(_name: SfxName, _volume = 1): void {},
  speak(_clips: number[]): void {},
  stopSpeaking(): void {},
};
