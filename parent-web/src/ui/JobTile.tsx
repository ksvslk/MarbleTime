import type {ReactNode} from 'react';
import type {Color} from '../api/types';
import type {IconName} from '../icons';
import {marblesFor} from '../lib/format';
import {CARD_COLORS} from '../tokens';
import {Icon} from './Icon';
import {Marbles} from './Marbles';

/** A job's icon on its colour (card colours mean nothing; they only help tell jobs apart). */
export function JobTile({icon, color, size = 56, children}: {icon: IconName; color: Color; size?: number; children?: ReactNode}) {
  return (
    <span className="job-tile" style={{width: size, height: size, background: CARD_COLORS[color]}}>
      <Icon name={icon} size={Math.round(size * 0.6)} />
      {children}
    </span>
  );
}

/**
 * The job as a kid sees it on the TV board: colour, icon in a light circle, title, marbles in a white pill (a
 * heart for a routine job, which is praised instead).
 */
export function JobCardPreview({icon, color, title, minutes, routine = false}: {icon: IconName; color: Color; title: string; minutes: number; routine?: boolean}) {
  return (
    <div className="job-card" style={{background: CARD_COLORS[color]}} aria-hidden="true">
      <span className="job-card-art">
        <Icon name={icon} size={64} />
      </span>
      <span className="job-card-title">{title || '…'}</span>
      <span className="marble-pill">
        {routine ? <Icon name="heart" size={18} /> : <Marbles count={marblesFor(minutes)} max={5} size={16} />}
      </span>
    </div>
  );
}

/** "♡ Routine": in place of the marbles for a job that is praised, not paid. */
export function RoutineLabel({label}: {label: string}) {
  return (
    <span className="routine-label">
      <Icon name="heart" size={16} />
      {label}
    </span>
  );
}
