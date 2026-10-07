/** Colours from the design canvas. Rules (docs/03 §12): gold only for time and the main button; white ring only for focus. */
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
  /** An empty place in today's jar: a faint fill, never a ring (white rings mean focus). */
  jarSlot: 'rgba(255,255,255,0.16)',
  chip: 'rgba(255,255,255,0.14)',
  tile: '#FFFFFF',
  tileOff: '#EEF0F8',
  greyInk: '#5A6080',
};

/** One marble is one short TV session: Estonia's TAI (2026) advises sessions of at most 10–15 minutes for ages 3–5 (docs/08 §1.6). */
export const MIN_PER_MARBLE = 10;
