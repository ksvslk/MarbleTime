/**
 * Strict mode: the TV itself counts watched time for the kids who are watching and keeps video apps closed
 * otherwise (docs/03 §5). Only the sideloaded Fire OS build can do it (strict.android.ts); everywhere else this is
 * the answer: not available, so the jar follows what the backend knows.
 */
export interface StrictState {
  enabled: boolean;
  /** The two grants strict mode needs on the stick (scripts/fire.sh grant app.marbletime.tv). */
  usageAccess: boolean;
  overlay: boolean;
  mode: 'free' | 'metering' | 'locked';
  why: 'none' | 'who' | 'empty' | 'bedtime' | 'grownups';
  watchers: {childId: string; leftSec: number}[];
  /** Until when a grown-up let the kids watch past bedtime (ms since 1970; 0: never). */
  bedtimeAllowedUntil?: number;
}

export interface StrictApi {
  available: boolean;
  state(): StrictState | null;
  /**
   * `setup`: the notes shown over a video, where the counter reports watched time (the backend and this TV's token),
   * and `guard`: the family has a grown-ups PIN, so the TV's settings are closed to kids.
   */
  setEnabled(on: boolean, setup: {warn5: string; warn1: string; apiUrl: string; token: string; guard: boolean}): void;
  /** The kids who are watching, each with the time left today in seconds, and their bedtime (minutes after local midnight). */
  startSession(watchers: Watcher[]): void;
  endSession(): void;
  /** The backend's newest time left for a kid. */
  setLeft(childId: string, leftSec: number): void;
  setFastClock(on: boolean): void;
  /** A grown-up entered the PIN: the TV's settings are open for this many minutes. */
  unlockGrownups(minutes: number): void;
  /** A grown-up entered the PIN: the kids may watch past bedtime for this many minutes. */
  allowBedtime(minutes: number): void;
  /** MarbleTime steps aside, back to what was in front. */
  leave(): void;
}

export interface Watcher {
  childId: string;
  leftSec: number;
  bedFrom?: number;
  bedTo?: number;
}

export const Strict: StrictApi = {
  available: false,
  state: () => null,
  setEnabled: () => {},
  startSession: () => {},
  endSession: () => {},
  setLeft: () => {},
  setFastClock: () => {},
  unlockGrownups: () => {},
  allowBedtime: () => {},
  leave: () => {},
};
