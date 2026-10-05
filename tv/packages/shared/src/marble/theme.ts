import {scaleWidth} from '../utils/scaling';

export * from './tokens';

/** Design px (1920×1080 canvas) → device px. */
export const s = (designPx: number) => scaleWidth(designPx);
