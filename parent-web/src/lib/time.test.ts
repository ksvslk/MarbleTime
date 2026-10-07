import {describe, expect, it} from 'vitest';
import {clampStep, MAX_CHANGE_MIN, maxTakeMin} from './time';

const min = (minutes: number) => minutes * 60;

describe('taking minutes away', () => {
  it('can take only what was earned, in whole marbles (10 minutes)', () => {
    expect(maxTakeMin(min(40))).toBe(40);
    expect(maxTakeMin(min(35))).toBe(30);
    expect(maxTakeMin(min(10))).toBe(10);
  });

  it('can take nothing from an empty jar, or from less than one marble', () => {
    expect(maxTakeMin(0)).toBe(0);
    expect(maxTakeMin(min(9))).toBe(0);
    expect(maxTakeMin(599)).toBe(0);
    expect(maxTakeMin(-60)).toBe(0); // never happens any more; still nothing to take
  });

  it('takes at most one change’s worth at a time', () => {
    expect(maxTakeMin(min(500))).toBe(MAX_CHANGE_MIN);
  });
});

describe('stepper bounds', () => {
  it('keeps a value inside the bounds when they shrink', () => {
    expect(clampStep(50, 10, 20)).toBe(20);
    expect(clampStep(0, 10, 20)).toBe(10);
    expect(clampStep(20, 10, 120)).toBe(20);
  });

  it('puts a value back on the marble grid', () => {
    expect(clampStep(14, 10, 120)).toBe(10);
    expect(clampStep(15, 10, 120)).toBe(20);
    expect(clampStep(26, 10, 120)).toBe(30);
  });
});
