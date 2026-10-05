import {requireOptionalNativeModule} from 'expo-modules-core';

/** MarbleTime's own audio on Fire OS: SoundPool for short effects (no media session), see MarbleAudioModule.kt. */
export interface MarbleAudio {
  preload(uris: string[]): void;
  play(uri: string, volume: number): void;
  /** Read-aloud: plays the clips one after another, after stopping what was being said. */
  speak(uris: string[]): void;
  stopSpeaking(): void;
}

export default requireOptionalNativeModule<MarbleAudio>('MarbleAudio');
