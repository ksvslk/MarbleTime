import type {Child} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {translate} from '../i18n/strings';
import {dailyBaseText, earnedText, formatMinutes, marblesFor, minutesFromSec} from '../lib/format';
import {colors, MARBLE_BASE} from '../tokens';
import {Icon} from './Icon';

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
 * A kid's TV time, one way or the other, never both (three numbers that don't add up read as a mistake):
 * - `jar`: what the jar on the TV shows now, "TV · 41 min left today" with its marbles. For families whose TV
 *   counts the time itself, or once any watched time has been counted.
 * - otherwise (Amazon Kids keeps the time, so what is left isn't known here): the daily base, then
 *   "+ 35 min earned" with its marbles, which is what is handed over to Amazon Kids.
 */
export function KidTime({child, max, jar = child.usedTodaySec > 0}: {child: Child; max?: number; jar?: boolean}) {
  const {lang} = useI18n();
  if (jar) {
    const left = minutesFromSec(child.leftTodaySec);
    return (
      <span className="kid-time">
        <span className="time kid-time-main">
          <Icon name="tv" size={20} />
          <span className="time-text">{translate(lang, 'leftToday', {min: formatMinutes(lang, left)})}</span>
        </span>
        <Marbles count={marblesFor(left)} max={max} />
      </span>
    );
  }
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

/** Stars toward the next character, as on the TV: earned ones filled in, the rest outlines. */
export function Stars({count, max, size = 18}: {count: number; max: number; size?: number}) {
  return (
    <span className="stars" aria-hidden="true">
      {Array.from({length: max}, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" focusable="false">
          <polygon
            points="12,2 15,9 22,9.3 16.5,14 18.5,21.5 12,17.3 5.5,21.5 7.5,14 2,9.3 9,9"
            fill={i < count ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            opacity={i < count ? 1 : 0.45}
          />
        </svg>
      ))}
    </span>
  );
}
