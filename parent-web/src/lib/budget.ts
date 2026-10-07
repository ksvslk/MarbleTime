/**
 * A kid's daily TV budget, the jar (DailyMax and DailyBase in backend/openapi.yaml; docs/08 §1): its size is the
 * most TV a day, every day starts with the free base in it, and jobs fill the rest. Pure functions.
 */
import type {Child} from '../api/types';
import {MIN_PER_MARBLE} from '../tokens';
import {clampStep} from './time';

/** Health guidance draws its line at 7 (docs/08 §1.1). */
export const GUIDANCE_AGE = 7;
/** The smallest jar (DailyMax minimum): one marble. */
export const CEILING_MIN = MIN_PER_MARBLE;

export interface Budget {
  /** The most TV a day, everything included: the jar's size. */
  dailyMaxMin: number;
  /** Free every day, never earned. */
  dailyBaseMin: number;
}

/** The highest ceiling for an age: 60 minutes under 7 (WHO, TAI 2025), 2 hours from 7 (TAI 2025). */
export const ceilingLimit = (age: number) => (age < GUIDANCE_AGE ? 60 : 120);

/** A new kid's ceiling: 60 minutes under 7, 90 from 7. */
export const defaultCeiling = (age: number) => (age < GUIDANCE_AGE ? 60 : 90);

/**
 * The base by default: half the ceiling, in whole marbles. An odd number of marbles rounds up (90 → 50 free,
 * 40 to earn), which keeps the earnable part within "a third to a half" (docs/08 §1.5).
 */
export const defaultBase = (dailyMaxMin: number) => Math.ceil(dailyMaxMin / 2 / MIN_PER_MARBLE) * MIN_PER_MARBLE;

export function defaultBudget(age: number): Budget {
  const dailyMaxMin = defaultCeiling(age);
  return {dailyMaxMin, dailyBaseMin: defaultBase(dailyMaxMin)};
}

/** A kid's budget as the server has it, made to fit (and the age's defaults for a server without it yet). */
export function budgetOf(child: Child): Budget {
  const dailyMaxMin = child.dailyMaxMin ?? defaultCeiling(child.age);
  return clampBudget(child.age, {dailyMaxMin, dailyBaseMin: child.dailyBaseMin ?? defaultBase(dailyMaxMin)});
}

/** A budget the contract accepts for the age: whole marbles, the ceiling within its limit, the base within the ceiling. */
export function clampBudget(age: number, budget: Budget): Budget {
  const dailyMaxMin = clampStep(budget.dailyMaxMin, CEILING_MIN, ceilingLimit(age));
  return {dailyMaxMin, dailyBaseMin: clampStep(budget.dailyBaseMin, 0, dailyMaxMin)};
}

/**
 * The budget after the age changed. A new kid's budget that nobody has touched follows the age's defaults
 * (6 → 8 years: 60 → 90 minutes); otherwise the grown-up's choice stays, only made to fit (8 → 5: at most 60).
 */
export function budgetForAge(age: number, budget: Budget, followDefaults: boolean): Budget {
  return followDefaults ? defaultBudget(age) : clampBudget(age, budget);
}

/** The jar plainly: the base, what jobs can add, and the ceiling (base + earnable = ceiling). */
export function jarParts({dailyMaxMin, dailyBaseMin}: Budget): {base: number; earnable: number; max: number} {
  return {base: dailyBaseMin, earnable: Math.max(0, dailyMaxMin - dailyBaseMin), max: dailyMaxMin};
}
