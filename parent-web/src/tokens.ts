import type {Color} from './api/types';

/**
 * Colours of the TV app, copied from tv/packages/shared/src/marble/tokens.ts (keep the two in step).
 * Rules (docs/03 §12): gold only for time and the main button; the white ring only for focus.
 */
export const colors = {
  bg: '#2A3A8C',
  bgGrownups: '#1F2A6B',
  ink: '#1D2147',
  white: '#FFFFFF',
  soft: '#DDE3FF',
  muted: '#C9D2FF',
  gold: '#FFC93C',
  goldLight: '#FFE08A',
  goldEdge: 'rgba(160,100,0,0.35)',
  coral: '#FF7A59',
  peach: '#FF9B71',
  sky: '#7FD3FF',
  lilac: '#C7A6FF',
  mint: '#86E3B8',
  glass: 'rgba(255,255,255,0.10)',
  glassEdge: 'rgba(255,255,255,0.75)',
  chip: 'rgba(255,255,255,0.14)',
  tile: '#FFFFFF',
  tileOff: '#EEF0F8',
  greyInk: '#5A6080',
};

/** Phone-only colours, not on the TV. */
export const phoneColors = {
  /** Error text on white cards (4.5:1). On blue, errors use goldLight, as the TV's wrong-PIN line does. */
  errorInk: '#B8401C',
  /** Placeholder text in inputs. */
  placeholder: '#8F95B2',
};

/** The darker gold under a marble's shine (the TV's Marble component). */
export const MARBLE_BASE = '#E2A92A';

/** One marble is one short TV session: 10 minutes (backend/openapi.yaml; docs/08 §1.6). */
export const MIN_PER_MARBLE = 10;

/** Card and avatar colours by their API name (`Color` in backend/openapi.yaml). */
export const CARD_COLORS: Record<Color, string> = {
  peach: colors.peach,
  mint: colors.mint,
  sky: colors.sky,
  lilac: colors.lilac,
  gold: colors.gold,
};

/** The tokens as CSS custom properties (bgGrownups → --bg-grownups), so styles.css never repeats a hex value. */
export function cssVariables(tokens: Record<string, string>): [string, string][] {
  return Object.entries(tokens).map(([name, value]) => [`--${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value]);
}
