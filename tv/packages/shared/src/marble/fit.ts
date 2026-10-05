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
      // A line may also break after a hyphen ("Mari-Liis"); FitText marks those spots for the platform.
      const parts = word.replace(/-(?=.)/g, '-\n').split('\n');
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.length > cap) return Number.POSITIVE_INFINITY; // wider than the box on its own
        const gap = i === 0 ? 1 : 0; // a space between words, nothing after a hyphen
        if (used === 0) used = part.length;
        else if (used + gap + part.length <= cap) used += gap + part.length;
        else {
          lines += 1;
          used = part.length;
        }
      }
    }
  }
  return lines;
}

/** Line height as a share of the font size (FitText draws text with it). */
export const LINE_HEIGHT = 1.15;

/** How many lines fit: `maxLines`, or fewer when a box of `maxHeight` can't hold them at this size. */
export function linesAllowed(size: number, maxLines: number, maxHeight?: number): number {
  return maxHeight ? Math.max(1, Math.min(maxLines, Math.floor(maxHeight / Math.round(size * LINE_HEIGHT)))) : maxLines;
}

export function fitFontSize(text: string, width: number, maxSize: number, minSize: number, maxLines: number, charWidth = CHAR_WIDTH, maxHeight?: number): number {
  for (let size = maxSize; size > minSize; size -= Math.max(1, size * 0.04)) {
    if (linesNeeded(text, width, size, charWidth) <= linesAllowed(Math.floor(size), maxLines, maxHeight)) return Math.floor(size);
  }
  return Math.floor(minSize);
}
