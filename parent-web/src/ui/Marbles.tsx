import type {Child} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {dailyBaseText, earnedText, formatMinutes, marblesFor, minutesFromSec} from '../lib/format';
import {colors, MARBLE_BASE} from '../tokens';

/** One gold marble = 5 minutes of TV, drawn like the TV's: a darker base, the gold ball up-left, a shine. */
export function Marble({size = 18}: {size?: number}) {
  return (
    <svg className="marble" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9.6" fill={MARBLE_BASE} stroke={colors.goldEdge} strokeWidth="0.8" />
      <circle cx="9.4" cy="9.2" r="8.6" fill={colors.gold} />
      <ellipse cx="7" cy="5.2" rx="3" ry="2" fill="#FFFFFF" opacity="0.7" />
    </svg>
  );
}

/** A row of marbles; past `max` the rest is a number ("+4"). `off` greys them out (time taken away). */
export function Marbles({count, max = 10, size = 18, off = false}: {count: number; max?: number; size?: number; off?: boolean}) {
  if (count <= 0) return null;
  const shown = Math.min(count, max);
  return (
    <span className={`marbles${off ? ' marbles-off' : ''}`} aria-hidden="true">
      {Array.from({length: shown}, (_, i) => (
        <Marble key={i} size={size} />
      ))}
      {count > shown ? <span className="marbles-more">+{count - shown}</span> : null}
    </span>
  );
}

/** Time the way the app shows it everywhere: marbles first, minutes small beside them ("●●● 15 min"). */
export function TimeLabel({minutes, signed = false, max}: {minutes: number; signed?: boolean; max?: number}) {
  const {lang} = useI18n();
  return (
    <span className="time">
      <Marbles count={marblesFor(Math.abs(minutes))} max={max} off={minutes < 0} />
      <span className="time-text">{formatMinutes(lang, minutes, signed)}</span>
    </span>
  );
}

/**
 * A kid's TV time: the daily base (every day, not in the jar), then "+ 35 min earned" with its marbles.
 * The two stay apart everywhere, since only earned time is in the balance and the hand-off. Words come
 * first here, so on a narrow screen it's the marbles that wrap.
 */
export function KidTime({child, max}: {child: Child; max?: number}) {
  const {lang} = useI18n();
  return (
    <span className="kid-time">
      <span className="time-text">{dailyBaseText(lang, child.dailyBaseMin)}</span>
      <span className="time">
        <span className="time-text">+ {earnedText(lang, child.balanceSec)}</span>
        <Marbles count={marblesFor(minutesFromSec(child.balanceSec))} max={max} />
      </span>
    </span>
  );
}
