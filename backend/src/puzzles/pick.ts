/**
 * Picking a kid's session from the bank, and moving their level after it (docs/08 §3.5–§3.7). Pure: the same bank,
 * kid and day give the same session, so a TV that asks twice shows the same questions.
 */
import {createHash} from 'node:crypto';
import {MAX_LEVEL, startLevel, SUBJECT_IDS, type PuzzleItem, type SubjectId} from './items';

/** Questions in a day's session: about 5 under 7 and 10 from 7 (docs/08 §3.5: short, and attention grows fast between 5–6 and 8–9). */
export const sessionLength = (age: number) => (age < 7 ? 5 : 10);

/** What the backend keeps per kid: a level and right answers in a row per subject, and the questions already seen (newest last). */
export interface PuzzleProgress {
  levels: Record<string, number>;
  streaks: Record<string, number>;
  seen: string[];
}

const clamp = (level: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
/** The kid's level in a subject: where their answers put them, or where their age starts. */
export const levelOf = (levels: Record<string, number>, subject: string, age: number) => clamp(levels[subject] ?? startLevel(age));
/**
 * The levels a session is picked at: the one a grown-up chose, for every subject, or (0, none) where the kid's
 * answers put them.
 */
export const playLevels = (levels: Record<string, number>, chosen: number | undefined): Record<string, number> =>
  chosen ? Object.fromEntries(SUBJECT_IDS.map(subject => [subject, clamp(chosen)])) : levels;

/** A number from a text, the same every time: orders the bank differently per kid and day without any randomness to store. */
const rank = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);

export interface Session {
  questions: PuzzleItem[];
  /** One more, a level easier: asked only after a miss on the last question, so the session ends on a success. */
  spare?: PuzzleItem;
}

/**
 * A session's plan: the subjects take turns (starting with a different one for each `seed`), each question at the
 * kid's level in its subject. `subjects` are the ones there are puzzles for.
 */
export function sessionPlan(subjects: SubjectId[], age: number, levels: Record<string, number>, seed: string): {subject: SubjectId; level: number}[] {
  if (!subjects.length) return [];
  const first = rank(seed) % subjects.length;
  return Array.from({length: sessionLength(age)}, (_, i) => {
    const subject = subjects[(first + i) % subjects.length];
    return {subject, level: levelOf(levels, subject, age)};
  });
}

/**
 * A session: for each place in the plan a freshly written puzzle of that subject if there is one (`fresh`), else one
 * from the bank. From the bank, new puzzles come before ones the kid has seen (those seen longest ago first); when
 * a level runs out, the nearest level fills in, easier first. The spare is always from the bank.
 */
export function pickSession(bank: PuzzleItem[], age: number, progress: Pick<PuzzleProgress, 'levels' | 'seen'>, seed: string, fresh: PuzzleItem[] = []): Session {
  const seenAt = new Map(progress.seen.map((id, i) => [id, i]));
  const taken = new Set<string>();
  const waiting = [...fresh];
  const pick = (subject: SubjectId, level: number, slot: string): PuzzleItem | undefined => {
    const nearest = Array.from({length: MAX_LEVEL}, (_, i) => i + 1).sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || a - b);
    for (const at of nearest) {
      const pool = bank.filter(item => item.subject === subject && item.level === at && !taken.has(item.id));
      if (!pool.length) continue;
      const order = (item: PuzzleItem) => (seenAt.has(item.id) ? 1 + seenAt.get(item.id)! / 1e6 : 0);
      const best = pool.sort((a, b) => order(a) - order(b) || rank(`${seed}|${slot}|${a.id}`) - rank(`${seed}|${slot}|${b.id}`))[0];
      taken.add(best.id);
      return best;
    }
    return undefined;
  };
  const subjects = SUBJECT_IDS.filter(subject => bank.some(item => item.subject === subject) || fresh.some(item => item.subject === subject));
  const questions: PuzzleItem[] = [];
  sessionPlan(subjects, age, progress.levels, seed).forEach(({subject, level}, i) => {
    const at = waiting.findIndex(item => item.subject === subject && !taken.has(item.id));
    const item = at >= 0 ? waiting.splice(at, 1)[0] : pick(subject, level, String(i));
    if (!item) return;
    taken.add(item.id);
    questions.push(item);
  });
  const last = questions[questions.length - 1];
  const spare = last && pick(last.subject, Math.max(1, levelOf(progress.levels, last.subject, age) - 1), 'spare');
  return {questions, ...(spare && {spare})};
}

/**
 * A kid's next session, written for them and waiting to be played (`questions` empty: none is ready), and the
 * questions of their earlier written sessions (newest last), so the writer doesn't repeat itself.
 */
export interface PuzzleSet extends Session {
  madeAt: number;
  recent: string[];
}

/** One finished round, as the TV reported it: kept so grown-ups can see how it went and the writer can fit the next one. */
export interface PuzzleRound {
  at: number;
  /** The questions in the order they were asked. */
  answers: {subject: SubjectId; level: number; right: boolean; prompt: string}[];
}
/** Rounds kept per kid (newest last). */
export const ROUNDS_KEPT = 30;

/**
 * How a kid did on the last questions of one subject, oldest first: what the writer is shown, so the next session
 * is pitched to the kid and not only to an age band.
 */
export function historyOf(rounds: PuzzleRound[], subject: SubjectId, last = 8): {prompt: string; right: boolean}[] {
  return rounds.flatMap(round => round.answers).filter(answer => answer.subject === subject).slice(-last).map(({prompt, right}) => ({prompt, right}));
}

/** Right answers in a row that move a kid up a level. */
export const UP_AFTER = 3;

/**
 * The kid's progress after a session. Difficulty follows the kid, not an age table (docs/08 §3.6): three right in a
 * row in a subject move it up a level, one miss moves it down. A "3 up, 1 down" staircase settles where about 79%
 * of answers are right (Levitt 1971), inside the 75–85% that kept children practising in Math Garden (Jansen 2013).
 * Answers to questions the bank no longer has are ignored. `seen` keeps the newest 400.
 * `chosen`: a grown-up chose the level, so the answers move nothing; where they had put the kid is kept for the day
 * the choice is taken back.
 */
export function afterSession(bank: PuzzleItem[], age: number, progress: PuzzleProgress, answers: {id: string; right: boolean}[], chosen?: number): PuzzleProgress {
  const byId = new Map(bank.map(item => [item.id, item]));
  const levels = {...progress.levels};
  const streaks = {...progress.streaks};
  const seen = [...progress.seen];
  for (const answer of answers) {
    const item = byId.get(answer.id);
    if (!item) continue;
    if (!chosen) {
      const level = levelOf(levels, item.subject, age);
      const streak = (streaks[item.subject] ?? 0) + 1;
      if (!answer.right) [levels[item.subject], streaks[item.subject]] = [clamp(level - 1), 0];
      else if (streak >= UP_AFTER) [levels[item.subject], streaks[item.subject]] = [clamp(level + 1), 0];
      else [levels[item.subject], streaks[item.subject]] = [level, streak];
    }
    const at = seen.indexOf(item.id);
    if (at >= 0) seen.splice(at, 1);
    seen.push(item.id);
  }
  return {levels, streaks, seen: seen.slice(-400)};
}
