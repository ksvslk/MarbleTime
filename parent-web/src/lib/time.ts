/** Rules for a kid's TV time, from the contract (DailyBase, adjust). Pure functions. */
import {MIN_PER_MARBLE} from '../tokens';
import {minutesFromSec} from './format';

/** Minutes every day before anything is earned (`DailyBase`): 0–240 in 5-minute steps, 30 by default. */
export const DAILY_BASE = {min: 0, max: 240, default: 30};

/** Most minutes one change can give or take (`deltaMin`). */
export const MAX_CHANGE_MIN = 120;

/**
 * Most minutes a grown-up can take away: what the kid earned, in whole 5-minute steps, so a take never goes
 * below an empty jar (the server refuses with `empty_jar` when nothing is earned). 0 means nothing to take.
 */
export function maxTakeMin(balanceSec: number): number {
  const steps = Math.floor(Math.max(0, minutesFromSec(balanceSec)) / MIN_PER_MARBLE);
  return Math.min(MAX_CHANGE_MIN, steps * MIN_PER_MARBLE);
}

/** A stepper value moved onto the 5-minute grid and into [min, max] (its bounds can shrink, e.g. after a take). */
export function clampStep(value: number, min: number, max: number): number {
  const onGrid = Math.round(value / MIN_PER_MARBLE) * MIN_PER_MARBLE;
  return Math.min(max, Math.max(min, onGrid));
}
