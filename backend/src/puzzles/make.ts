/**
 * Writes puzzles into the bank: `npx tsx src/puzzles/make.ts --lang et --subject logic --level 2 --count 10`
 * (any of them may be a comma list or left out for all; `--dry` shows what would be kept without saving).
 * Models: WRITER (default gemini-3.8-flash) writes; SOLVERS check (default: gemini-3.5-flash, gemini-2.5-flash and the
 * writer's own model: three generations of one family, the best this project can call today; a model of another
 * family belongs here as soon as one is reachable). All through this machine's gcloud sign-in. Only what every check passed is saved, with where it came from.
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {aiModel} from '../ai/models';
import {LANGS, type Lang} from '../domain/types';
import {MAX_LEVEL, SUBJECT_IDS, type PuzzleItem, type SubjectId} from './items';
import {write} from './writer';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const list = <T extends string>(name: string, all: readonly T[]): T[] => (arg(name)?.split(',').filter((x): x is T => all.includes(x as T)) ?? [...all]);

const bankFile = (lang: Lang) => join(__dirname, 'bank', `${lang}.json`);
const load = (lang: Lang): PuzzleItem[] => (existsSync(bankFile(lang)) ? (JSON.parse(readFileSync(bankFile(lang), 'utf8')) as PuzzleItem[]) : []);

async function main() {
  const writer = aiModel(process.env.WRITER ?? 'gemini-3.8-flash', 120_000);
  const solverIds = (process.env.SOLVERS ?? 'gemini-3.5-flash,gemini-2.5-flash,gemini-3.8-flash').split(',');
  const solvers = solverIds.map(id => aiModel(id.trim(), 60_000));
  const count = Number(arg('count') ?? 10);
  const dry = process.argv.includes('--dry');
  for (const lang of list<Lang>('lang', LANGS)) {
    const bank = load(lang);
    for (const subject of list<SubjectId>('subject', SUBJECT_IDS)) {
      for (const level of list('level', Array.from({length: MAX_LEVEL}, (_, i) => String(i + 1))).map(Number)) {
        const have = bank.filter(item => item.subject === subject && item.level === level).map(item => item.prompt);
        // A cell that fails (a busy model) is skipped and said so; the bank keeps what it has, and is saved as it grows.
        const written = await write(writer, solvers, {lang, subject, level, count, have}).catch(error => {
          console.log(`\n${lang} · ${subject} · level ${level}: skipped (${String(error).slice(0, 100)})`);
          return undefined;
        });
        if (!written) continue;
        const {accepted, rejected} = written;
        console.log(`\n${lang} · ${subject} · level ${level}: kept ${accepted.length} of ${accepted.length + rejected.length}`);
        for (const item of accepted) {
          const answers = item.choices.map((c, i) => `${i === item.answer ? '✔' : ' '}${c.emoji ?? c.text}`).join('  |  ');
          console.log(`  + ${item.prompt}${item.picture.length ? `  [${item.picture.join('')}]` : ''}\n      ${answers}\n      → ${item.reason}`);
        }
        for (const item of rejected) console.log(`  – ${item.prompt}\n      dropped: ${item.why}`);
        bank.push(...accepted);
        if (!dry) writeFileSync(bankFile(lang), `${JSON.stringify(bank, null, 1)}\n`);
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
