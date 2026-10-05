/**
 * Text fitting for user content (names, jobs, AI questions, four languages):
 * pick the largest font size at which `text` fits `width` within `maxLines`, wrapping on spaces.
 * A width estimate, so it works the same on Fire OS and Vega before any layout pass;
 * FitText then corrects with the real layout where the platform reports it.
 */

/** Average glyph width as a share of the font size, with a safety margin (system UI fonts, semi-bold). */
export const CHAR_WIDTH = 0.58;

/** Capital letters are wider. */
export const CAPS_WIDTH = 0.7;

export function linesNeeded(text: string, width: number, size: number, charWidth = CHAR_WIDTH): number {
  const cap = Math.max(1, Math.floor(width / (size * charWidth)));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    lines += 1;
    let used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (word.length > cap) return Number.POSITIVE_INFINITY; // one word wider than the box
      if (used === 0) used = word.length;
      else if (used + 1 + word.length <= cap) used += 1 + word.length;
      else {
        lines += 1;
        used = word.length;
      }
    }
  }
  return lines;
}

export function fitFontSize(text: string, width: number, maxSize: number, minSize: number, maxLines: number, charWidth = CHAR_WIDTH): number {
  for (let size = maxSize; size > minSize; size -= Math.max(1, size * 0.04)) {
    if (linesNeeded(text, width, size, charWidth) <= maxLines) return Math.floor(size);
  }
  return Math.floor(minSize);
}
