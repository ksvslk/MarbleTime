import {describe, expect, it} from 'vitest';
import {isPairCode, normalizeCode, pinProblem} from './validate';

describe('grown-ups PIN', () => {
  it('needs exactly four digits, typed the same twice', () => {
    expect(pinProblem('1234', '1234')).toBeNull();
    expect(pinProblem('123', '123')).toBe('pinFormat');
    expect(pinProblem('12a4', '12a4')).toBe('pinFormat');
    expect(pinProblem('12345', '12345')).toBe('pinFormat');
    expect(pinProblem('1234', '1243')).toBe('pinMismatch');
  });
});

describe('pairing codes', () => {
  it('cleans up what was typed or linked', () => {
    expect(normalizeCode('k7qx-4m')).toBe('K7QX4M');
    expect(normalizeCode(' K7 QX 4M ')).toBe('K7QX4M');
  });

  it('accepts the TV’s alphabet only: no I, O, 0 or 1', () => {
    expect(isPairCode('K7QX4M')).toBe(true);
    expect(isPairCode('K7QX4')).toBe(false);
    expect(isPairCode('K7QX4MM')).toBe(false);
    expect(isPairCode('KIQX4M')).toBe(false);
    expect(isPairCode('K0QX4M')).toBe(false);
    expect(isPairCode('K1QX4M')).toBe(false);
  });
});
