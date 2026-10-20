/**
 * The daily budget (docs/08, Decisions 2–4, §1): each kid's jar is today's TV time. Its size is the daily maximum from
 * health guidance; every day starts with the base (an allowance, never earned); approved jobs fill the rest in
 * 10-minute marbles; a job approved when the jar is full earns a character token instead of time. Every job gives
 * TV time (the founder, Oct 13: until then a job marked routine was praised without a marble). The same rules apply
 * whoever approves, on the phone or on the TV.
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
  /** Minutes that go into the jar (0 for praise, and for a character earned with a full jar). */
  minutesCredited: number;
}

/** A kid's jar as of today: `used…` are today's (ledger.ts currentChild zeroes another day's). */
type Jar = Pick<Child, 'age' | 'dailyMaxMin' | 'dailyBaseMin' | 'balanceSec' | 'usedBaseSec' | 'usedEarnedSec'>;

/** TV watched today, in seconds. */
export const usedTodaySec = (child: Jar) => (child.usedBaseSec ?? 0) + (child.usedEarnedSec ?? 0);
/** What is left of today's base. */
export const baseLeftSec = (child: Jar) => Math.max(0, budgetOf(child).dailyBaseMin * 60 - (child.usedBaseSec ?? 0));
/** The jar: TV time left today = what is left of the base + earned time not yet used. */
export const leftTodaySec = (child: Jar) => baseLeftSec(child) + child.balanceSec;

/**
 * Room left to earn into today's jar, in whole marbles' worth of seconds: the maximum − (base + earned time not yet
 * used) − earned time already watched today − what is spoken for. So what was watched plus what is left never
 * passes the day's maximum.
 */
function roomSec(child: Jar, reservedMin: number): number {
  const {dailyMaxMin, dailyBaseMin} = budgetOf(child);
  const room = dailyMaxMin * 60 - (dailyBaseMin * 60 + child.balanceSec) - (child.usedEarnedSec ?? 0) - reservedMin * 60;
  return Math.max(0, Math.floor(room / MARBLE_SEC) * MARBLE_SEC);
}

/**
 * What a job gives the kid, as the job card shows it:
 * - a job that fits in today's jar: its minutes;
 * - a job that doesn't fit: whatever part fits (nothing, once the jar is full) and a character token for the rest,
 *   so no marble is dropped unseen.
 * `reservedMin` is room already promised to the kid's other waiting claims.
 */
export function rewardFor(child: Jar, job: {minutes: number}, reservedMin = 0): Reward {
  const room = roomSec(child, reservedMin);
  const wanted = jobMinutes(job.minutes) * 60;
  return wanted <= room ? {reward: 'marbles', minutesCredited: wanted / 60} : {reward: 'character', minutesCredited: room / 60};
}

/**
 * What a yes gives a claim that was promised something at "I did it!": the promise. Only the jar's maximum can
 * still cut it (the jar filled another way meanwhile): then the part that fits goes in and the rest is a character.
 */
export function keptPromise(child: Jar, promised: Reward): Reward {
  if (promised.reward === 'praise') return promised;
  const fits = Math.min(promised.minutesCredited * 60, roomSec(child, 0));
  return fits < promised.minutesCredited * 60 ? {reward: 'character', minutesCredited: fits / 60} : promised;
}
