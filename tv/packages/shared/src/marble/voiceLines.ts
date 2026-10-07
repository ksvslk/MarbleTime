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
  const keys = ['whoTitle', 'grownupWillCheck', 'yay', 'wow', 'thankYou', 'newCharacter'] as const;
  return [...new Set(keys.map(key => voiceKey(t(lang, key))))];
}
