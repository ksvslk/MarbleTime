/** Time as the family sees it: marbles (one = 10 minutes), minutes, repeat rules and "2 min ago". Pure functions. */
import type {Lang, Repeat} from '../api/types';
import {translate} from '../i18n/strings';
import {MIN_PER_MARBLE} from '../tokens';

/** Whole marbles in some minutes (a part-marble isn't shown, as on the TV); none for zero or less. */
export const marblesFor = (minutes: number) => (minutes > 0 ? Math.floor(minutes / MIN_PER_MARBLE) : 0);

/** Whole minutes. A balance (never below 0) rounds down; a part-minute taken (a negative change) counts as a minute. */
export const minutesFromSec = (sec: number) => (sec >= 0 ? Math.floor(sec / 60) : -Math.ceil(-sec / 60));

const MINUS = '−';

/** "35 min" ("35 Min." in German). `signed` adds a plus for gains: "+15 min", "−10 min". */
export function formatMinutes(lang: Lang, minutes: number, signed = false): string {
  const text = translate(lang, 'min', {n: Math.abs(minutes)});
  if (minutes < 0) return MINUS + text;
  return signed ? `+${text}` : text;
}

/** The daily base, which isn't in the jar: "30 min every day". */
export const dailyBaseText = (lang: Lang, minutes: number) => translate(lang, 'perDay', {min: formatMinutes(lang, minutes)});

/** What the kid earned on top of the daily base (the marbles in the jar): "15 min earned". */
export const earnedText = (lang: Lang, balanceSec: number) => translate(lang, 'earned', {min: formatMinutes(lang, minutesFromSec(balanceSec))});

/** ISO weekday (1 = Monday … 7 = Sunday) as a short name in the language. */
export function weekdayName(lang: Lang, isoDay: number): string {
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(lang, {weekday: 'short', timeZone: 'UTC'}).format(new Date(Date.UTC(2024, 0, isoDay)));
}

/** "Every day", "Mon–Fri", "Weekends", "Mon, Wed, Fri" or "Once". */
export function repeatSummary(lang: Lang, repeat: Repeat | undefined): string {
  if (!repeat || repeat.kind === 'daily') return translate(lang, 'everyDay');
  if (repeat.kind === 'once') return translate(lang, 'once');
  const days = [...new Set(repeat.days)].sort((a, b) => a - b);
  const key = days.join();
  if (days.length === 7) return translate(lang, 'everyDay');
  if (key === '1,2,3,4,5') return `${weekdayName(lang, 1)}–${weekdayName(lang, 5)}`;
  if (key === '6,7') return translate(lang, 'weekends');
  return days.map(day => weekdayName(lang, day)).join(', ');
}

/** "now", "2 min. ago", "3 hr. ago", "yesterday"; a date after a week. */
export function timeAgo(lang: Lang, then: number, now: number): string {
  const format = new Intl.RelativeTimeFormat(lang, {numeric: 'auto', style: 'short'});
  const minutes = Math.floor(Math.max(0, now - then) / 60000);
  if (minutes < 1) return format.format(0, 'second');
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return format.format(-days, 'day');
  return new Intl.DateTimeFormat(lang, {day: 'numeric', month: 'short'}).format(new Date(then));
}
