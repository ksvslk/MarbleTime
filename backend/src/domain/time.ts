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

/** The local date ("2026-10-05") in an IANA time zone. Daily jobs and the game cap use the family's day. */
export function localDay(time: number, timezone: string): string {
  const parts = dayFormat(timezone).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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
