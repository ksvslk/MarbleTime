/**
 * A kid's next puzzle session, written for them while nobody waits (the founder, Oct 12: a fixed bank is not
 * enough). Whenever a kid has no written session waiting, one is written in the background: for each subject in
 * the session's plan the writer makes a few puzzles at the kid's level, the blind solvers check them (writer.ts),
 * and what passes becomes the session; a place the writer couldn't fill comes from the bank. The kid never waits
 * for this: until a written session is ready, sessions come from the bank.
 * Dynamic (the founder, Oct 13): the writer is shown how the kid did on their last questions in each subject and
 * pitches the new ones to that, so difficulty follows the kid between the age bands too.
 */
import type {AiModel} from '../ai/model';
import type {Repo} from '../domain/repo';
import {localDay} from '../domain/time';
import type {Lang} from '../domain/types';
import type {PuzzleItem} from './items';
import {historyOf, pickSession, playLevels, sessionPlan, type PuzzleSet} from './pick';
import {write} from './writer';
import {SUBJECT_IDS} from './items';

export interface PuzzleJob {
  familyId: string;
  childId: string;
  /** Who holds the "being written" lease for this kid (released when the job ends). */
  holder: string;
}

export interface DailyDeps {
  repo: Repo;
  now: () => number;
  writer: AiModel;
  solvers: AiModel[];
  bank: (lang: Lang) => PuzzleItem[];
}

export const leaseName = (childId: string) => `puzzles#${childId}`;
/** Extra puzzles asked of the writer per subject, for the ones the checks drop. */
const SPARE_DRAFTS = 2;
/** Earlier written questions the writer is shown, so it writes new ones. */
const REMEMBERED = 80;

export interface DailyReport {
  childId: string;
  status: 'ready' | 'skipped' | 'failed';
  written: number;
  fromBank: number;
  dropped: {prompt: string; why: string}[];
  error?: string;
}

/** Writes one kid's next session (an async job). Never throws: it ends ready, skipped (nothing to do) or failed. */
export async function makePuzzleSet(deps: DailyDeps, job: PuzzleJob): Promise<DailyReport> {
  const report: DailyReport = {childId: job.childId, status: 'skipped', written: 0, fromBank: 0, dropped: []};
  try {
    const [family, child, before] = await Promise.all([
      deps.repo.getFamily(job.familyId), deps.repo.getChild(job.familyId, job.childId), deps.repo.getPuzzleSet(job.familyId, job.childId),
    ]);
    if (!family || !child || child.puzzlesOff || before?.questions.length) return report;
    const bank = deps.bank(family.lang);
    const levels = playLevels({...child.puzzleLevels}, child.puzzleLevel);
    const seed = `${child.id}|${localDay(deps.now(), family.timezone)}|${before?.madeAt ?? 0}`;
    const plan = sessionPlan([...SUBJECT_IDS], child.age, levels, seed);
    const recent = before?.recent ?? [];
    // How the kid did lately, for the writer. Not with a level a grown-up chose: that one is to be kept as it is.
    const rounds = child.puzzleLevel ? [] : await deps.repo.getPuzzleRounds(job.familyId, job.childId);
    // One writer call per subject in the plan, for as many puzzles as the plan has places for it (and a few more).
    const fresh = (await Promise.all([...new Set(plan.map(p => p.subject))].map(async subject => {
      const places = plan.filter(p => p.subject === subject);
      const level = places[0].level;
      const have = [...bank.filter(item => item.subject === subject && item.level === level).map(item => item.prompt), ...recent];
      const {accepted, rejected} = await write(deps.writer, deps.solvers, {lang: family.lang, subject, level, count: places.length + SPARE_DRAFTS, have, history: historyOf(rounds, subject)}, new Date(deps.now()));
      report.dropped.push(...rejected);
      return accepted.slice(0, places.length);
    }))).flat();
    const session = pickSession(bank, child.age, {levels, seen: child.puzzleSeen ?? []}, seed, fresh);
    if (!session.questions.length) return {...report, status: 'failed', error: 'nothing was written and the bank is empty'};
    report.written = session.questions.filter(q => fresh.includes(q)).length;
    report.fromBank = session.questions.length - report.written;
    // A session with nothing new in it is just the bank's: the bank serves that anyway, so nothing is kept.
    if (!report.written) return {...report, status: 'failed', error: 'the writer made nothing that passed the checks'};
    const set: PuzzleSet = {...session, madeAt: deps.now(), recent: [...recent, ...fresh.map(item => item.prompt)].slice(-REMEMBERED)};
    await deps.repo.putPuzzleSet(job.familyId, job.childId, set);
    return {...report, status: 'ready'};
  } catch (error) {
    return {...report, status: 'failed', error: String(error).slice(0, 200)};
  } finally {
    await deps.repo.releaseLease(leaseName(job.childId), job.holder).catch(() => undefined);
  }
}
