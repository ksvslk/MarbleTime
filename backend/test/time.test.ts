import {describe, expect, it} from 'vitest';
import {isoWeekday, isTimezone, localDay} from '../src/domain/time';

describe('family-local days', () => {
  it('turns a time into the date in a time zone', () => {
    const t = Date.UTC(2026, 9, 5, 21, 30); // Monday 21:30 UTC
    expect(localDay(t, 'UTC')).toBe('2026-10-05');
    expect(localDay(t, 'Europe/Tallinn')).toBe('2026-10-06'); // 00:30 on Tuesday
    expect(localDay(t, 'America/Los_Angeles')).toBe('2026-10-05');
    expect(localDay(Date.UTC(2026, 9, 6, 6, 59), 'America/Los_Angeles')).toBe('2026-10-05'); // 23:59 the day before
  });

  it('follows daylight saving time', () => {
    // Tallinn leaves summer time on Sunday 25 October 2026 (UTC+3 → UTC+2).
    expect(localDay(Date.UTC(2026, 9, 24, 21, 30), 'Europe/Tallinn')).toBe('2026-10-25');
    expect(localDay(Date.UTC(2026, 9, 25, 21, 30), 'Europe/Tallinn')).toBe('2026-10-25'); // 23:30 in winter time
    expect(localDay(Date.UTC(2026, 9, 25, 22, 0), 'Europe/Tallinn')).toBe('2026-10-26');
  });

  it('gives ISO weekdays (1 = Monday … 7 = Sunday)', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-07')).toBe(3);
    expect(isoWeekday('2026-10-11')).toBe(7);
  });

  it('knows real time zones', () => {
    expect(isTimezone('Europe/Tallinn')).toBe(true);
    expect(isTimezone('UTC')).toBe(true);
    expect(isTimezone('Mars/Base')).toBe(false);
  });
});
