import {bank, Family, SAMPLE_FAMILY, textOf} from './data';
import {Lang, t} from './i18n';

/**
 * Everything the TV says out loud is a recorded clip (scripts/make-voices.py: Polly for en/de/es,
 * Neurokõne for Estonian); nothing is synthesised on the TV. Clips are found by their text.
 */
export const voiceKey = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The lines to record for a language: fixed lines, the built-in questions, and a family's names and jobs
 * (the sample family here; in M2 the backend records each real family's own).
 */
export function spokenLines(lang: Lang, family: Family = SAMPLE_FAMILY): string[] {
  const lines = new Set<string>();
  const add = (text: string) => lines.add(voiceKey(text));
  for (const key of ['whoTitle', 'grownupWillCheck', 'yay', 'wellDone', 'capReached', 'tryAgain', 'yes'] as const) add(t(lang, key));
  for (const kid of family.kids) add(t(lang, 'greatJob', {name: kid.name}));
  for (const jobs of Object.values(family.jobs)) {
    for (const job of jobs) {
      add(textOf(job.title, lang));
      add(t(lang, 'grownupSaidYes', {job: textOf(job.title, lang)}));
    }
  }
  for (const games of Object.values(family.games)) {
    for (const game of games) {
      add(t(lang, game.title));
      add(t(lang, 'finishedGame', {game: t(lang, game.title)}));
    }
  }
  for (const topic of Object.values(bank(lang))) {
    for (const questions of Object.values(topic)) {
      for (const q of questions) {
        add(q.say);
        add(q.praise);
      }
    }
  }
  return [...lines];
}
