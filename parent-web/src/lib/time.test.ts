import {describe, expect, it} from 'vitest';
import {clampStep, DAILY_BASE, MAX_CHANGE_MIN, maxTakeMin} from './time';

const min = (minutes: number) => minutes * 60;

describe('taking minutes away', () => {
  it('can take only what was earned, in whole 5-minute steps', () => {
    expect(maxTakeMin(min(35))).toBe(35);
    expect(maxTakeMin(min(12))).toBe(10);
    expect(maxTakeMin(min(5))).toBe(5);
  });

  it('can take nothing from an empty jar, or from less than one marble', () => {
    expect(maxTakeMin(0)).toBe(0);
    expect(maxTakeMin(min(4))).toBe(0);
    expect(maxTakeMin(299)).toBe(0);
    expect(maxTakeMin(-60)).toBe(0); // never happens any more; still nothing to take
  });

  it('takes at most one change’s worth at a time', () => {
    expect(maxTakeMin(min(500))).toBe(MAX_CHANGE_MIN);
  });
});

describe('stepper bounds', () => {
  it('keeps a value inside the bounds when they shrink', () => {
    expect(clampStep(25, 5, 10)).toBe(10);
    expect(clampStep(0, 5, 10)).toBe(5);
    expect(clampStep(10, 5, 120)).toBe(10);
  });

  it('puts a value back on the 5-minute grid', () => {
    expect(clampStep(12, 5, 120)).toBe(10);
    expect(clampStep(13, 5, 120)).toBe(15);
  });

  it('gives the daily base the contract’s range: 0–240 in 5-minute steps, 30 by default', () => {
    expect(DAILY_BASE).toEqual({min: 0, max: 240, default: 30});
    expect(clampStep(300, DAILY_BASE.min, DAILY_BASE.max)).toBe(240);
    expect(clampStep(-5, DAILY_BASE.min, DAILY_BASE.max)).toBe(0);
  });
});
