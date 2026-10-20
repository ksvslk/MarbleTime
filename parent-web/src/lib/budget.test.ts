import {describe, expect, it} from 'vitest';
import type {Child} from '../api/types';
import {budgetForAge, budgetOf, ceilingLimit, clampBudget, defaultBase, defaultBudget, jarParts} from './budget';

describe('the most TV a day, by age (health guidance)', () => {
  it('is at most 60 minutes under 7, and at most 2 hours from 7', () => {
    expect(ceilingLimit(3)).toBe(60);
    expect(ceilingLimit(6)).toBe(60);
    expect(ceilingLimit(7)).toBe(120);
    expect(ceilingLimit(12)).toBe(120);
  });

  it('starts a new kid at 60 minutes under 7 and 90 from 7, half of it free', () => {
    expect(defaultBudget(5)).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
    expect(defaultBudget(7)).toEqual({dailyMaxMin: 90, dailyBaseMin: 50});
    expect(defaultBudget(11)).toEqual({dailyMaxMin: 90, dailyBaseMin: 50});
  });

  it('makes the free half whole marbles, rounding an odd number of marbles up', () => {
    expect(defaultBase(60)).toBe(30);
    expect(defaultBase(120)).toBe(60);
    expect(defaultBase(90)).toBe(50);
    expect(defaultBase(30)).toBe(20);
    expect(defaultBase(10)).toBe(10);
  });
});

describe('a budget the contract accepts', () => {
  it('never lets the ceiling pass the age’s limit, nor the base pass the ceiling', () => {
    expect(clampBudget(6, {dailyMaxMin: 90, dailyBaseMin: 50})).toEqual({dailyMaxMin: 60, dailyBaseMin: 50});
    expect(clampBudget(6, {dailyMaxMin: 120, dailyBaseMin: 100})).toEqual({dailyMaxMin: 60, dailyBaseMin: 60});
    expect(clampBudget(9, {dailyMaxMin: 150, dailyBaseMin: 0})).toEqual({dailyMaxMin: 120, dailyBaseMin: 0});
    expect(clampBudget(9, {dailyMaxMin: 120, dailyBaseMin: 60})).toEqual({dailyMaxMin: 120, dailyBaseMin: 60});
  });

  it('keeps at least one marble in the jar, and whole marbles throughout', () => {
    expect(clampBudget(4, {dailyMaxMin: 0, dailyBaseMin: 0})).toEqual({dailyMaxMin: 10, dailyBaseMin: 0});
    expect(clampBudget(8, {dailyMaxMin: 65, dailyBaseMin: 33})).toEqual({dailyMaxMin: 70, dailyBaseMin: 30});
    expect(clampBudget(8, {dailyMaxMin: 45, dailyBaseMin: -5})).toEqual({dailyMaxMin: 50, dailyBaseMin: 0});
  });
});

describe('changing the age', () => {
  it('moves a new kid’s untouched budget to the new age’s defaults', () => {
    expect(budgetForAge(8, {dailyMaxMin: 60, dailyBaseMin: 30}, true)).toEqual({dailyMaxMin: 90, dailyBaseMin: 50});
    expect(budgetForAge(5, {dailyMaxMin: 90, dailyBaseMin: 50}, true)).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
  });

  it('keeps a grown-up’s choice, only making it fit (as the server does)', () => {
    expect(budgetForAge(8, {dailyMaxMin: 40, dailyBaseMin: 20}, false)).toEqual({dailyMaxMin: 40, dailyBaseMin: 20});
    expect(budgetForAge(5, {dailyMaxMin: 120, dailyBaseMin: 80}, false)).toEqual({dailyMaxMin: 60, dailyBaseMin: 60});
  });
});

describe('the jar', () => {
  it('is the free base plus what jobs can add', () => {
    expect(jarParts({dailyMaxMin: 60, dailyBaseMin: 30})).toEqual({base: 30, earnable: 30, max: 60});
    expect(jarParts({dailyMaxMin: 90, dailyBaseMin: 90})).toEqual({base: 90, earnable: 0, max: 90});
    expect(jarParts({dailyMaxMin: 120, dailyBaseMin: 0})).toEqual({base: 0, earnable: 120, max: 120});
  });
});

describe('a kid’s budget from the server', () => {
  const kid = (overrides: Partial<Child>): Child => ({
    id: 'k1',
    name: 'Mia',
    avatar: 'bunny',
    color: 'lilac',
    age: 6,
    balanceSec: 0,
    dailyBaseMin: 30,
    dailyMaxMin: 60,
    characterTokens: 0,
    usedTodaySec: 0,
    leftTodaySec: 1800,
    puzzles: {on: true, stars: 0, starsNeeded: 5, doneToday: false, levels: {}, level: 0, levelAges: ['4–5', '6', '7–8', '9–10']},
    ...overrides,
  });

  it('is taken as it is when it fits', () => {
    expect(budgetOf(kid({}))).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
    expect(budgetOf(kid({age: 9, dailyMaxMin: 120, dailyBaseMin: 40}))).toEqual({dailyMaxMin: 120, dailyBaseMin: 40});
  });

  it('is made to fit the age, and follows the age’s defaults where a server leaves it out', () => {
    expect(budgetOf(kid({age: 5, dailyMaxMin: 90, dailyBaseMin: 45}))).toEqual({dailyMaxMin: 60, dailyBaseMin: 50});
    const {dailyMaxMin: _max, ...older} = kid({age: 8, dailyBaseMin: 30});
    expect(budgetOf(older as Child)).toEqual({dailyMaxMin: 90, dailyBaseMin: 30});
  });
});
