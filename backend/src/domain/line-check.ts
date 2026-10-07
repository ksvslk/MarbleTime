/**
 * Checking a made line before anyone hears it, as scripts/make-voices.py checks the TV's recorded clips: a voice model
 * can say a short word in the wrong language (Estonian "Jee!" came out as English "gee", 4.9 s long), improvise ("vau
 * vau kord" for "Vau!"), change words ("Tubli tüdruk, Miia!" for "Tubli töö, Mia!") or say a short line twice
 * ("Thank you. Thank you."). So a line with far more speech than its words need is made again, and so is one whose
 * words, heard back by Gemini in the same language, don't match closely. No per-word rules: only letters are compared.
 */

/** Heard words must match this closely (letters only): right lines measured 0.96–1.00, wrong ones 0.25–0.69. */
export const MIN_MATCH = 0.85;

/**
 * The most speech a line may have (silence around it doesn't count): 1 s plus 0.15 s per character of its text, as the
 * clips' check counts (lines said twice or padded with extra words ran far longer).
 */
export const maxSpeechMs = (text: string) => 1000 + 150 * [...text].length;

/** Letters only, as the clips are compared: NFC, lowercase, word characters (Python's \w: letters, digits, _). */
export const letters = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');

/**
 * How alike two texts are, from 0 to 1: Python's difflib.SequenceMatcher(None, a, b).ratio(), 2·M / (|a| + |b|),
 * where M counts the characters in the longest common block and, recursively, in the blocks left and right of it.
 * (difflib's "autojunk" only starts at 200 characters; lines are at most 160.)
 */
export function similarity(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length + y.length === 0) return 1;
  const where = new Map<string, number[]>();
  y.forEach((char, j) => where.set(char, [...(where.get(char) ?? []), j]));
  let matched = 0;
  const queue: [number, number, number, number][] = [[0, x.length, 0, y.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    // The longest block x[i..i+k) = y[j..j+k) in the range; the first one found wins a tie, as in difflib.
    let [besti, bestj, best] = [alo, blo, 0];
    let lengths = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of where.get(x[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (lengths.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > best) [besti, bestj, best] = [i - k + 1, j - k + 1, k];
      }
      lengths = next;
    }
    if (best === 0) continue;
    matched += best;
    if (alo < besti && blo < bestj) queue.push([alo, besti, blo, bestj]);
    if (besti + best < ahi && bestj + best < bhi) queue.push([besti + best, ahi, bestj + best, bhi]);
  }
  return (2 * matched) / (x.length + y.length);
}

/** How well what was heard matches the line's words (letters only), 0–1. */
export const heardScore = (text: string, heard: string) => similarity(letters(text), letters(heard));
