/**
 * The daily budget (docs/08, Decisions 2–4, §1): each kid's jar is today's TV time. Its size is the daily maximum from
 * health guidance; every day starts with the base (an allowance, never earned); approved jobs fill the rest in
 * 10-minute marbles; a job approved when the jar is full earns a character token instead of time, and a routine job
 * is praised without a marble. The same rules apply whoever approves, on the phone or on the TV.
 */
import {type Child, MARBLE_SEC, type RewardKind} from './types';

/** Minutes per marble: every budget value is a whole number of them. */
export const MARBLE_MIN = MARBLE_SEC / 60;
/** A job is worth 1–3 marbles. */
export const JOB_MIN = MARBLE_MIN;
export const JOB_MAX = 3 * MARBLE_MIN;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The most a day can ever be for the age: 60 minutes under 7 (WHO 2019; TAI 2025), 120 from 7 (TAI 2025). */
export const maxCeiling = (age: number) => (age < 7 ? 60 : 120);
/** The default daily maximum: 60 under 7, 90 from 7 (docs/08 §1.1). */
export const defaultMax = (age: number) => (age < 7 ? 60 : 90);
/** The default base: half the maximum rounded up to whole marbles (60 → 30, 90 → 50, 120 → 60), so a third to a half is earnable (docs/08 §1.5). */
export const defaultBase = (dailyMaxMin: number) => Math.ceil(dailyMaxMin / 2 / MARBLE_MIN) * MARBLE_MIN;

/** A daily maximum within the rules: whole marbles, at least one, never above the age's ceiling. */
export const clampMax = (age: number, dailyMaxMin: number) =>
  clamp(Math.round(dailyMaxMin / MARBLE_MIN) * MARBLE_MIN, MARBLE_MIN, maxCeiling(age));
/** A base within the rules: whole marbles (old bases in steps of 5 round up, like the default), never above the maximum. */
export const clampBase = (dailyBaseMin: number, dailyMaxMin: number) =>
  clamp(Math.ceil(dailyBaseMin / MARBLE_MIN) * MARBLE_MIN, 0, dailyMaxMin);

export interface Budget {
  dailyMaxMin: number;
  dailyBaseMin: number;
}

/**
 * A kid's budget as stored values read today. Kids stored before the maximum existed get the default for their age;
 * old bases (steps of 5, up to 240) round up to whole marbles, at most the maximum; a missing base is the default.
 */
export function budgetOf(child: Pick<Child, 'age' | 'dailyMaxMin' | 'dailyBaseMin'>): Budget {
  const dailyMaxMin = clampMax(child.age, child.dailyMaxMin ?? defaultMax(child.age));
  const dailyBaseMin = child.dailyBaseMin === undefined ? defaultBase(dailyMaxMin) : clampBase(child.dailyBaseMin, dailyMaxMin);
  return {dailyMaxMin, dailyBaseMin};
}

/**
 * The budget after a parent's change (POST or PATCH /children). Values are clamped, never refused: the maximum to the
 * age's ceiling (so changing the age clamps it), the base to the maximum. A new maximum without a base keeps the base
 * unless it no longer fits.
 */
export function changedBudget(
  current: Budget | undefined,
  age: number,
  input: {dailyMaxMin?: number; dailyBaseMin?: number},
): Budget {
  const dailyMaxMin = clampMax(age, input.dailyMaxMin ?? current?.dailyMaxMin ?? defaultMax(age));
  const dailyBaseMin = clampBase(input.dailyBaseMin ?? current?.dailyBaseMin ?? defaultBase(dailyMaxMin), dailyMaxMin);
  return {dailyMaxMin, dailyBaseMin};
}

/** A job's minutes as the rules read them: rounded up to whole marbles, 1–3 of them (old jobs had 5–120 in 5s). */
export const jobMinutes = (minutes: number) => clamp(Math.ceil(minutes / MARBLE_MIN) * MARBLE_MIN, JOB_MIN, JOB_MAX);

export interface Reward {
  reward: RewardKind;
  /** Minutes that went into the jar (0 for a character or praise). */
  minutesCredited: number;
}

/**
 * What approving a job gives the kid:
 * - a routine job: praise, nothing credited;
 * - otherwise, with room in today's jar (room = maximum − (base + earned time not yet used)) for at least one marble:
 *   the job's minutes, but no more than the room, in whole marbles;
 * - with no room for a marble (the jar is full): a character token instead of time.
 */
export function rewardFor(child: Pick<Child, 'age' | 'dailyMaxMin' | 'dailyBaseMin' | 'balanceSec'>, job: {minutes: number; routine: boolean}): Reward {
  if (job.routine) return {reward: 'praise', minutesCredited: 0};
  const {dailyMaxMin, dailyBaseMin} = budgetOf(child);
  const roomSec = dailyMaxMin * 60 - (dailyBaseMin * 60 + child.balanceSec);
  if (roomSec < MARBLE_SEC) return {reward: 'character', minutesCredited: 0};
  const creditSec = Math.min(jobMinutes(job.minutes) * 60, Math.floor(roomSec / MARBLE_SEC) * MARBLE_SEC);
  return {reward: 'marbles', minutesCredited: creditSec / 60};
}
