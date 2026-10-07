import {describe, expect, it} from 'vitest';
import {dailyBaseText, earnedText, formatMinutes, marblesFor, minutesFromSec, repeatSummary, timeAgo, weekdayName} from './format';

describe('marbles and minutes', () => {
  it('counts whole marbles of 10 minutes, none for zero or less', () => {
    expect(marblesFor(30)).toBe(3);
    expect(marblesFor(15)).toBe(1);
    expect(marblesFor(9)).toBe(0);
    expect(marblesFor(0)).toBe(0);
    expect(marblesFor(-10)).toBe(0);
  });

  it('turns a balance in seconds into whole minutes; part of a minute owed counts as owed', () => {
    expect(minutesFromSec(2100)).toBe(35);
    expect(minutesFromSec(59)).toBe(0);
    expect(minutesFromSec(-30)).toBe(-1);
    expect(minutesFromSec(-600)).toBe(-10);
  });

  it('writes minutes in the family language, signed when asked', () => {
    expect(formatMinutes('en', 35)).toBe('35 min');
    expect(formatMinutes('de', 35)).toBe('35 Min.');
    expect(formatMinutes('en', 15, true)).toBe('+15 min');
    expect(formatMinutes('en', -10, true)).toBe('−10 min');
    expect(formatMinutes('es', -10)).toBe('−10 min');
  });
});

describe('daily base and earned time, kept apart', () => {
  it('writes the base as minutes every day', () => {
    expect(dailyBaseText('en', 30)).toBe('30 min every day');
    expect(dailyBaseText('de', 45)).toBe('45 Min. jeden Tag');
    expect(dailyBaseText('et', 0)).toBe('0 min iga päev');
  });

  it('writes earned time from the balance in seconds, in whole minutes', () => {
    expect(earnedText('en', 15 * 60)).toBe('15 min earned');
    expect(earnedText('es', 15 * 60 + 59)).toBe('15 min ganados');
    expect(earnedText('en', 0)).toBe('0 min earned');
  });
});

describe('repeat summaries', () => {
  it('says "every day" for daily jobs, all seven days, or no rule', () => {
    expect(repeatSummary('en', {kind: 'daily'})).toBe('Every day');
    expect(repeatSummary('en', {kind: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7]})).toBe('Every day');
    expect(repeatSummary('et', undefined)).toBe('Iga päev');
  });

  it('names school days, weekends, or lists the days in order', () => {
    expect(repeatSummary('en', {kind: 'weekdays', days: [5, 4, 3, 2, 1]})).toBe('Mon–Fri');
    expect(repeatSummary('en', {kind: 'weekdays', days: [7, 6]})).toBe('Weekends');
    expect(repeatSummary('de', {kind: 'weekdays', days: [6, 7]})).toBe('Am Wochenende');
    expect(repeatSummary('en', {kind: 'weekdays', days: [5, 1, 3, 3]})).toBe('Mon, Wed, Fri');
  });

  it('says "once" for one-off jobs', () => {
    expect(repeatSummary('en', {kind: 'once'})).toBe('Once');
    expect(repeatSummary('es', {kind: 'once'})).toBe('Una vez');
  });

  it('uses each language’s own day names (ISO weekdays, 1 = Monday)', () => {
    expect(weekdayName('en', 1)).toBe('Mon');
    expect(weekdayName('en', 7)).toBe('Sun');
    expect(weekdayName('de', 1)).toBe('Mo');
    expect(weekdayName('es', 7)).toBe('dom');
  });
});

describe('time ago', () => {
  const now = Date.UTC(2026, 9, 5, 12, 0);
  const minute = 60_000;

  it('says now, minutes, hours, yesterday', () => {
    expect(timeAgo('en', now - 20_000, now)).toBe('now');
    expect(timeAgo('en', now - 2 * minute, now)).toBe('2 min. ago');
    expect(timeAgo('en', now - 3 * 60 * minute, now)).toBe('3 hr. ago');
    expect(timeAgo('en', now - 24 * 60 * minute, now)).toBe('yesterday');
    expect(timeAgo('de', now - 2 * minute, now)).toBe('vor 2 Min.');
  });

  it('shows a date after a week, and treats a clock running ahead as now', () => {
    expect(timeAgo('en', now - 10 * 24 * 60 * minute, now)).toBe('Sep 25');
    expect(timeAgo('en', now + 5_000, now)).toBe('now');
  });
});
