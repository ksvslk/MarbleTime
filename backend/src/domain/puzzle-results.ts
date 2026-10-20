/**
 * A kid's puzzles on the TV: today's session from the bank (GET /device/puzzles/session) and what finishing it
 * earns (POST /device/puzzles/results). The stars' rules are in puzzles.ts; picking and levels in puzzles/pick.ts.
 */
import {bankFor} from '../puzzles/bank';
import type {PuzzleItem} from '../puzzles/items';
import {leaseName} from '../puzzles/daily';
import {afterSession, pickSession, playLevels, type PuzzleProgress, type PuzzleRound, ROUNDS_KEPT} from '../puzzles/pick';
import type {Deps} from './deps';
import {busy, conflict, notFound} from './errors';
import {currentChild} from './ledger';
import {PUZZLE_STARS} from './puzzles';
import {newId} from './secrets';
import {localDay} from './time';
import type {Child, Family} from './types';
import type {PuzzleResultInput} from './validate';
import {childView} from './views';

const bank = (deps: Deps, family: Family) => (deps.puzzles ?? bankFor)(family.lang);
const progressOf = (child: Child): PuzzleProgress => ({levels: {...child.puzzleLevels}, streaks: {...child.puzzleStreaks}, seen: [...(child.puzzleSeen ?? [])]});

/** What the TV needs to show a puzzle (the answer too: the TV marks it, so a session works with no network). */
const puzzleView = (item: PuzzleItem) => ({
  id: item.id, subject: item.subject, level: item.level, prompt: item.prompt, picture: [...item.picture],
  choices: item.choices.map(choice => (choice.emoji ? {emoji: choice.emoji} : {text: choice.text ?? ''})), answer: item.answer, reason: item.reason,
});

/** How long a session may take to write before another try may start. */
const WRITING_MS = 10 * 60_000;

/**
 * Makes sure a session is being written for a kid who has none waiting: at most one writer per kid at a time (a
 * lease), and nothing at all where no model can be reached. Never throws: a kid's puzzles don't depend on it.
 */
export async function wantNextSession(deps: Deps, family: Family, child: Pick<Child, 'id' | 'puzzlesOff'>): Promise<void> {
  if (!deps.startPuzzles || child.puzzlesOff) return;
  try {
    if ((await deps.repo.getPuzzleSet(family.id, child.id))?.questions.length) return;
    const holder = newId();
    const now = deps.now();
    if (!(await deps.repo.takeLease(leaseName(child.id), holder, now + WRITING_MS, now))) return;
    await deps.startPuzzles({familyId: family.id, childId: child.id, holder});
  } catch (error) {
    console.error('starting a puzzle session failed:', error);
  }
}

/**
 * A kid's session, in the family's language: the one written for them if it is ready (the same until they finish
 * it), else one from the bank, while their written one is started. Empty where there is neither. At the level a
 * grown-up chose, if they chose one.
 */
export async function puzzleSession(deps: Deps, family: Family, childId: string) {
  const child = await currentChild(deps, family, childId, false);
  if (!child) throw notFound('child');
  if (child.puzzlesOff) throw conflict('puzzles_off', 'Puzzles are turned off for this kid');
  const written = await deps.repo.getPuzzleSet(family.id, child.id);
  if (written?.questions.length) return {questions: written.questions.map(puzzleView), ...(written.spare && {spare: puzzleView(written.spare)})};
  await wantNextSession(deps, family, child);
  const day = localDay(deps.now(), family.timezone);
  const progress = progressOf(child);
  const {questions, spare} = pickSession(bank(deps, family), child.age, {...progress, levels: playLevels(progress.levels, child.puzzleLevel)}, `${child.id}|${day}`);
  return {questions: questions.map(puzzleView), ...(spare && {spare: puzzleView(spare)})};
}

/** Adds a finished round to the kid's history (the newest ROUNDS_KEPT stay). Never throws: the round itself counted. */
async function keepRound(deps: Deps, family: Family, childId: string, round: PuzzleRound): Promise<void> {
  if (!round.answers.length) return;
  try {
    await deps.repo.putPuzzleRounds(family.id, childId, [...(await deps.repo.getPuzzleRounds(family.id, childId)), round].slice(-ROUNDS_KEPT));
  } catch (error) {
    console.error('keeping a puzzle round failed:', error);
  }
}

/** GET /children/{childId}/puzzles: how the kid's rounds went, newest first. */
export async function puzzleRounds(deps: Deps, family: Family, childId: string) {
  if (!(await deps.repo.getChild(family.id, childId))) throw notFound('child');
  const rounds = await deps.repo.getPuzzleRounds(family.id, childId);
  return {rounds: rounds.reverse().map(round => ({...round, right: round.answers.filter(answer => answer.right).length, total: round.answers.length}))};
}

/**
 * A finished round: the kid's levels follow their answers, the questions count as seen, the round earns a star
 * (every finished round does, whatever the score: the founder, Oct 13), and the last star needed becomes a
 * character token. Idempotent on the TV's id.
 */
export async function finishPuzzles(deps: Deps, family: Family, input: PuzzleResultInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const done = await deps.repo.getRef(family.id, input.childId, input.id);
    if (done && done.kind !== 'puzzle') throw conflict('id_in_use', 'This id was already used for something else');
    const child = await currentChild(deps, family, input.childId, true);
    if (!child) throw notFound('child');
    if (done) return childView(child);
    if (child.puzzlesOff) throw conflict('puzzles_off', 'Puzzles are turned off for this kid');
    const earned = (child.puzzleStars ?? 0) + 1;
    const token = earned >= PUZZLE_STARS;
    // The answers may be about the session written for this kid, whose puzzles no bank holds.
    const written = await deps.repo.getPuzzleSet(family.id, child.id);
    const played = [...bank(deps, family), ...(written?.questions ?? []), ...(written?.spare ? [written.spare] : [])];
    const result = await deps.repo.finishPuzzles(family.id, child.id, {
      refId: input.id, day: localDay(deps.now(), family.timezone), stars: token ? 0 : earned, token,
      progress: afterSession(played, child.age, progressOf(child), input.answers ?? [], child.puzzleLevel), prevStars: child.puzzleStars ?? 0,
    });
    if (result === 'ok') {
      deps.changed(family.id);
      // The round is kept before the next session is started: the writer fits it to how this one went.
      await keepRound(deps, family, child.id, {at: deps.now(), answers: (input.answers ?? []).flatMap(answer => {
        const item = played.find(q => q.id === answer.id);
        return item ? [{subject: item.subject, level: item.level, right: answer.right, prompt: item.prompt}] : [];
      })});
      // A written session that was played is used up; the next one is started, so it is ready for the next round.
      const ids = new Set((input.answers ?? []).map(answer => answer.id));
      if (written?.questions.some(q => ids.has(q.id))) await deps.repo.putPuzzleSet(family.id, child.id, {questions: [], madeAt: written.madeAt, recent: written.recent});
      await wantNextSession(deps, family, child);
    }
    if (result !== 'changed') {
      const now = await currentChild(deps, family, input.childId, false);
      if (!now) throw notFound('child');
      return childView(now);
    }
    // Another session finished at the same moment: look again.
  }
  throw busy();
}
