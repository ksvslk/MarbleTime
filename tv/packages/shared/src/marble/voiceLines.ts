import {Lang, t} from './i18n';

/**
 * What the TV reads out loud: fixed phrases are recorded clips (scripts/make-voices.py, Gemini-TTS narrator), and a
 * family's own words (names, jobs, reasons) come from the backend in the same voice. Nothing is synthesised on the TV.
 */
export const voiceKey = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The phrases to record for a language: the fixed ones only. A family's own words (names, jobs, reasons) are said by
 * the backend's narrator in the same voice (speech.ts).
 */
export function spokenLines(lang: Lang): string[] {
  const keys = [
    'whoTitle', 'grownupWillCheck', 'yay', 'wow', 'thankYou', 'newCharacter',
    // What a job card gives, and why a grown-up said "not yet".
    'sayMarbles1', 'sayMarbles2', 'sayMarbles3', 'sayCharacter', 'sayAndCharacter', 'sayPraise',
    'notYetWhy_not_finished', 'notYetWhy_together', 'notYetWhy_later',
    // Strict mode and puzzles (a puzzle's own words come from the backend's narrator, like a family's).
    'watchTitle', 'puzzles', 'puzzleYes', 'sayStar',
  ] as const;
  // Asking for a new character's words: typed on the TV or in the phone app (no voice since Oct 19). The question
  // itself is said by the backend's narrator (its German clip came out far too long 18 times running on Oct 12).
  const asking = [t(lang, 'characterNewHint')];
  return [...new Set([...keys.map(key => t(lang, key)), t(lang, 'starsCharacter', {n: PUZZLE_STARS}), ...asking].map(voiceKey))];
}

/** Stars for a character, as the recorded "{n} stars: a new character!" says it (the backend's PUZZLE_STARS). */
const PUZZLE_STARS = 5;
