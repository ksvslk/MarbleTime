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

/** The job as a kid sees it on the TV board: colour, icon in a light circle, title, marbles in a white pill. */
export function JobCardPreview({icon, color, title, minutes}: {icon: IconName; color: Color; title: string; minutes: number}) {
  return (
    <div className="job-card" style={{background: CARD_COLORS[color]}} aria-hidden="true">
      <span className="job-card-art">
        <Icon name={icon} size={64} />
      </span>
      <span className="job-card-title">{title || '…'}</span>
      <span className="marble-pill">
        <Marbles count={marblesFor(minutes)} max={5} size={16} />
      </span>
    </div>
  );
}
