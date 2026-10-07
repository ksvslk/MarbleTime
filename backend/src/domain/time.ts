export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

const formats = new Map<string, Intl.DateTimeFormat>();

function dayFormat(timezone: string): Intl.DateTimeFormat {
  let format = formats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'});
    formats.set(timezone, format);
  }
  return format;
}

/** The local date ("2026-10-05") in an IANA time zone. Daily jobs use the family's day. */
export function localDay(time: number, timezone: string): string {
  const parts = dayFormat(timezone).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** The zone's offset from UTC at a moment, in ms (local wall time read as UTC, minus the moment). */
function offset(time: number, timezone: string): number {
  let format = clocks.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    clocks.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(time).map(p => [p.type, Number(p.value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - (time - (time % 1000 + 1000) % 1000);
}

/**
 * The moment a "YYYY-MM-DD" day starts in an IANA time zone: its local midnight, or the first moment after it where a
 * clock change skips midnight (Chile springs forward at 00:00).
 */
export function startOfDay(day: string, timezone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date);
  // The offset at the guess, then at the answer (they differ when a clock change falls near midnight).
  const first = wall - offset(wall, timezone);
  const second = wall - offset(first, timezone);
  const inDay = [first, second].filter(time => localDay(time, timezone) === day);
  return inDay.length ? Math.min(...inDay) : second;
}

/** ISO weekday of a "YYYY-MM-DD" date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay() || 7;
}

export function isTimezone(timezone: string): boolean {
  try {
    dayFormat(timezone);
    return true;
  } catch {
    return false;
  }
}

/** The day after a "YYYY-MM-DD" date. */
export function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** A real calendar date written "YYYY-MM-DD". */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) === value;
}
