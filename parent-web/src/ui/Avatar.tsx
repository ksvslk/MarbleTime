import type {Avatar as AvatarName, Color} from '../api/types';
import {CARD_COLORS} from '../tokens';
import {Art} from './Icon';

/** A kid's animal on their colour, as on the TV's "Who's here?" screen. */
export function Avatar({avatar, color, size = 48}: {avatar: AvatarName; color: Color; size?: number}) {
  return (
    <span className="avatar" style={{width: size, height: size, background: CARD_COLORS[color]}}>
      <Art name={avatar} size={Math.round(size * 0.8)} />
    </span>
  );
}
