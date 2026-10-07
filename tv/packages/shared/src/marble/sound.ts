import type {SfxName} from './sfx';

/** A spoken line starting or ending (a character's mouth follows its own line). */
export interface LineEvent {
  uri: string;
  state: 'start' | 'end';
}

/**
 * Sound effects and read-aloud clips. Platform files implement it: sound.android.ts (Fire OS, our
 * MarbleAudio module) and, later, sound.kepler.ts (Vega). This default is silent (tests, other platforms).
 */
export const Sound = {
  preload(): void {},
  play(_name: SfxName, _volume = 1): void {},
  /** Lines in order, cutting off what was being said: recorded clips (asset ids) or https URLs. */
  speak(_lines: (number | string)[]): void {},
  /** Lines said after whatever is being said now, without cutting it off. */
  enqueue(_lines: (number | string)[]): void {},
  onLine(_listener: (event: LineEvent) => void): () => void {
    return () => {};
  },
  stopSpeaking(): void {},
};
