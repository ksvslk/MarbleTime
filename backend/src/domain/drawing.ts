/**
 * The drawing worker (docs/08, Decisions 5): turns a character's card into checked, layered art. It runs outside any
 * request: an async Lambda (src/characters-lambda.ts) in AWS, in the background of the dev server locally.
 *
 * Each round (at most MAX_ROUNDS, counting first draws, repairs and redraws alike):
 * 1. Draw: the drawing model draws the card (never the kid's words) as an SVG with the measured rules.
 * 2. Check code (svg/check.ts): the SVG as written, then the sanitised SVG (parts kept, a filled mouth), then the
 *    rendered picture (standing on the floor, centred). Any problems go back word for word with the SVG for a full
 *    corrected one (a repair round).
 * 3. Sanitise (svg/sanitize.ts) and rasterise (svg/rasterize.ts) to PNG.
 * 4. Picture check: a second model looks at the PNG: kid-friendly, not a copy of a known character, matches the card.
 *    A no makes the next round a fresh drawing with the reason.
 * In the last round, a drawing whose only problem is where it stands is moved onto the floor in code (svg/layout.ts).
 * Success: the layers (svg/layers.ts) and the whole SVG are stored, the character is ready, the family hears about it.
 * No success in MAX_ROUNDS: the character needs help, the kid gets the token back, the family hears about it.
 * Nothing about the kid (their words, name or age) goes to these models or into the logs.
 */
import type {AiModel, Usage} from '../ai/model';
import {checkClean, checkLayout, checkSvg, extractSvg} from '../svg/check';
import {splitLayers} from '../svg/layers';
import {floorTransform, moveAll} from '../svg/layout';
import type {Raster, Rasterize} from '../svg/rasterize';
import {type Clean, sanitizeSvg} from '../svg/sanitize';
import {CHECK_SCHEMA, CHECK_SYSTEM, checkPrompt, drawingPrompt, type Feedback, readVerdict, type Verdict} from './character-prompts';
import type {Repo} from './repo';
import type {Character} from './types';

export const MAX_ROUNDS = 3;

/** What the worker is asked to do (the async invoke's payload). */
export interface DrawingJob {
  familyId: string;
  characterId: string;
}

export interface DrawingDeps {
  repo: Repo;
  now: () => number;
  /** Draws the SVG. */
  artist: AiModel;
  /** Looks at the picture. */
  checker: AiModel;
  rasterize: Rasterize;
  /** Tells the family's open realtime connections that something changed (best-effort). */
  notify: (familyId: string) => Promise<void>;
}

export interface Round {
  kind: 'draw' | 'repair' | 'redraw';
  /** What the code checks found (sent back for repair). */
  problems: string[];
  /** The picture check's reason for a no. */
  rejected?: string;
  /** The model or the renderer failed. */
  error?: string;
  /** In the last round, the drawing was moved onto the floor in code (this transform). */
  moved?: string;
  ms: number;
  usage: Usage;
}

export interface DrawingReport {
  characterId: string;
  /** "gone": the character was removed (or settled) while it was being drawn. */
  status: 'ready' | 'needs_help' | 'skipped' | 'gone';
  rounds: Round[];
}

type Outcome = {done: true; clean: Clean} | {done: false; feedback?: Feedback};

const add = (a: Usage, b: Usage): Usage => ({inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens});
const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error));

/** Asks the picture check, once more if the answer isn't usable; undefined if there's still no verdict. */
async function lookAt(deps: DrawingDeps, character: Character, png: Buffer, round: Round): Promise<Verdict | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await deps.checker.json({
      system: CHECK_SYSTEM, user: checkPrompt(character.name, character.card), schema: CHECK_SCHEMA, name: 'picture_check', images: [png], maxTokens: 1024,
    });
    round.usage = add(round.usage, reply.usage);
    if (reply.stop === 'refused' || reply.stop === 'blocked') return {ok: false, reason: 'The picture check would not pass this picture; draw a gentler, simpler character.'};
    const verdict = reply.stop === 'done' ? readVerdict(reply.value) : undefined;
    if (verdict) return verdict;
  }
  return undefined;
}

/**
 * One round. In the last one, a drawing whose only problem is where it stands is moved onto the floor in code
 * rather than lost (svg/layout.ts).
 */
async function drawRound(deps: DrawingDeps, character: Character, feedback: Feedback | undefined, round: Round, last: boolean): Promise<Outcome> {
  const reply = await deps.artist.text({user: drawingPrompt(character.name, character.card, feedback), maxTokens: 16000});
  round.usage = add(round.usage, reply.usage);
  if (reply.stop === 'refused' || reply.stop === 'blocked' || !reply.text.trim()) {
    round.error = `no drawing (${reply.stop})`;
    return {done: false};
  }
  const svg = extractSvg(reply.text);
  const problems = checkSvg(svg);
  if (reply.stop === 'cut_off') problems.unshift('your answer was cut off before the end: keep the whole SVG under 12 KB');
  let clean: Clean | undefined;
  try {
    clean = sanitizeSvg(svg);
  } catch {
    // Not XML: checkSvg has said so.
  }
  let raster: Raster | undefined;
  if (clean) {
    // Parts the sanitiser removed only count when the SVG itself had them (else checkSvg already said they're missing).
    problems.push(...checkClean(clean.root).filter(problem => problems.length === 0 || !problem.startsWith('group "')));
    try {
      raster = await deps.rasterize(clean.svg);
      const layout = checkLayout(raster.box);
      if (layout.length && !problems.length && last && raster.box && !layout[0].startsWith('remove the background')) {
        const transform = floorTransform(raster.box);
        const moved = moveAll(clean, transform);
        const again = await deps.rasterize(moved.svg);
        if (!checkLayout(again.box).length) {
          [clean, raster] = [moved, again];
          round.moved = transform;
          layout.length = 0;
        }
      }
      problems.push(...layout);
    } catch (error) {
      problems.push(`the SVG could not be drawn (${(error as Error).message.slice(0, 120)})`);
    }
  }
  round.problems = problems;
  if (problems.length || !clean || !raster) return {done: false, feedback: {kind: 'repair', svg, problems: problems.length ? problems : ['not a usable SVG document']}};
  const verdict = await lookAt(deps, character, raster.png, round);
  if (!verdict) {
    round.error = 'the picture check gave no usable answer';
    return {done: false, feedback: {kind: 'redraw', reason: 'The picture could not be checked. Draw it again, simply and clearly.'}};
  }
  if (!verdict.ok) {
    round.rejected = verdict.reason;
    return {done: false, feedback: {kind: 'redraw', reason: verdict.reason}};
  }
  return {done: true, clean};
}

/** Draws one character (an async job). Never throws for a failed drawing: it ends ready or needs_help. */
export async function drawCharacter(deps: DrawingDeps, job: DrawingJob): Promise<DrawingReport> {
  const character = await deps.repo.getCharacter(job.familyId, job.characterId);
  if (!character || character.status !== 'drawing') return {characterId: job.characterId, status: 'skipped', rounds: []};
  const rounds: Round[] = [];
  let feedback: Feedback | undefined;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const started = Date.now();
    const round: Round = {kind: feedback ? feedback.kind : 'draw', problems: [], ms: 0, usage: {inputTokens: 0, outputTokens: 0}};
    rounds.push(round);
    let outcome: Outcome;
    try {
      outcome = await drawRound(deps, character, feedback, round, i === MAX_ROUNDS - 1);
    } catch (error) {
      round.error = errorText(error);
      outcome = {done: false, feedback};
    }
    round.ms = Date.now() - started;
    if (outcome.done) {
      const {viewBox, layers} = splitLayers(outcome.clean.root);
      const stored = await deps.repo.finishCharacter(job.familyId, {id: character.id, childId: character.childId, viewBox, svg: outcome.clean.svg, layers}, deps.now());
      if (stored) await deps.notify(job.familyId);
      return {characterId: character.id, status: stored ? 'ready' : 'gone', rounds};
    }
    feedback = outcome.feedback;
  }
  const settled = await deps.repo.failCharacter(job.familyId, character);
  if (settled) await deps.notify(job.familyId);
  return {characterId: character.id, status: settled ? 'needs_help' : 'gone', rounds};
}
