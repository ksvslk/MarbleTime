/** Rules for giving and taking a kid's TV time, from the contract (adjust). Pure functions. */
import {MIN_PER_MARBLE} from '../tokens';
import {minutesFromSec} from './format';

/** Most minutes one change can give or take (`deltaMin`). */
export const MAX_CHANGE_MIN = 120;

/**
 * Most minutes a grown-up can take away: what the kid earned, in whole marbles, so a take never goes below an
 * empty jar (the server refuses with `empty_jar` when nothing is earned). 0 means nothing to take.
 */
export function maxTakeMin(balanceSec: number): number {
  const marbles = Math.floor(Math.max(0, minutesFromSec(balanceSec)) / MIN_PER_MARBLE);
  return Math.min(MAX_CHANGE_MIN, marbles * MIN_PER_MARBLE);
}

/** A stepper value moved onto the marble grid and into [min, max] (its bounds can shrink, e.g. after a take). */
export function clampStep(value: number, min: number, max: number): number {
  const onGrid = Math.round(value / MIN_PER_MARBLE) * MIN_PER_MARBLE;
  return Math.min(max, Math.max(min, onGrid));
}
