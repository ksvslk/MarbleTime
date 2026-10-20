import {requireOptionalNativeModule} from 'expo-modules-core';

/** Strict mode on Fire OS (sideloaded): see MarbleStrictModule.kt and docs/03 §5. */
export interface StrictState {
  enabled: boolean;
  /** The two grants strict mode needs (scripts/fire.sh grant app.marbletime.tv). */
  usageAccess: boolean;
  overlay: boolean;
  mode: 'free' | 'metering' | 'locked';
  why: 'none' | 'who' | 'empty';
  watchers: {childId: string; leftSec: number}[];
}

export interface MarbleStrict {
  state(): StrictState;
  setEnabled(on: boolean, texts: {warn5?: string; warn1?: string; apiUrl?: string; token?: string}): StrictState;
  startSession(watchers: {childId: string; leftSec: number}[]): StrictState;
  endSession(): StrictState;
  setLeft(childId: string, leftSec: number): void;
  setFastClock(on: boolean): void;
  leave(): void;
}

export default requireOptionalNativeModule<MarbleStrict>('MarbleStrict');
