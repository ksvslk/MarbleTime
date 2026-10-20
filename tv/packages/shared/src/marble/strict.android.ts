import type {StrictApi, StrictState, Watcher} from './strict';

// The native service and its rules live in the Fire OS app (tv/packages/expotv/modules/marble-strict).
const native: {
  state(): StrictState;
  setEnabled(on: boolean, setup: {warn5: string; warn1: string; apiUrl: string; token: string; guard: string}): StrictState;
  startSession(watchers: Watcher[]): StrictState;
  endSession(): StrictState;
  setLeft(childId: string, leftSec: number): void;
  setFastClock(on: boolean): void;
  unlockGrownups(minutes: number): void;
  allowBedtime(minutes: number): void;
  leave(): void;
} | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-modules-core').requireOptionalNativeModule('MarbleStrict');
  } catch {
    return null;
  }
})();

/** Fire OS: StrictService counts and locks (MarbleStrict); a build without the module behaves like any other platform. */
export const Strict: StrictApi = {
  available: native !== null,
  state: () => native?.state() ?? null,
  // The native side takes plain strings: guard "1" or "0".
  setEnabled: (on, setup) => void native?.setEnabled(on, {...setup, guard: setup.guard ? '1' : '0'}),
  startSession: watchers => void native?.startSession(watchers),
  endSession: () => void native?.endSession(),
  setLeft: (childId, leftSec) => native?.setLeft(childId, leftSec),
  setFastClock: on => native?.setFastClock(on),
  unlockGrownups: minutes => native?.unlockGrownups(minutes),
  allowBedtime: minutes => native?.allowBedtime(minutes),
  leave: () => native?.leave(),
};
