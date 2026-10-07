import {requireOptionalNativeModule} from 'expo-modules-core';

/** MarbleTime's own audio on Fire OS: SoundPool for short effects (no media session), see MarbleAudioModule.kt. */
export interface MarbleAudio {
  preload(uris: string[]): void;
  play(uri: string, volume: number): void;
  /** Read-aloud: plays the clips one after another, after stopping what was being said. */
  speak(uris: string[]): void;
  /** Lines (also https URLs: a character's line) after what is being said now. */
  enqueue(uris: string[]): void;
  stopSpeaking(): void;
  /** Each line starting and ending ("onLine": {uri, state: 'start' | 'end'}), for a character's mouth. */
  addListener(event: 'onLine', listener: (event: {uri: string; state: 'start' | 'end'}) => void): {remove(): void};
}

export default requireOptionalNativeModule<MarbleAudio>('MarbleAudio');
