/**
 * Characters, the API side (docs/08, Decisions 4–6). A job approved while the jar is full gives the kid a character
 * token; the kid spends it on a new cartoon character from their own words. The art director runs in the request (a
 * few seconds); drawing and checking run in the background (drawing.ts) and the family hears `changed` when done.
 */
import type {AiModel, JsonReply} from '../ai/model';
import {hedge, HedgeError, type Hedging} from '../ai/resilience';
import {DIRECTOR_SCHEMA, DIRECTOR_SYSTEM, type Direction, directorUser, NO_SENTENCE, readDirection} from './character-prompts';
import type {Deps} from './deps';
import {ApiError, busy, conflict, notFound} from './errors';
import {takeHourly} from './rate';
import {newId} from './secrets';
import {MINUTE} from './time';
import type {Character, Family, Lang} from './types';
import {type CharacterInput, isId} from './validate';
import {characterArtView, characterView, deviceCharacterView, newestFirst} from './views';

/**
 * A character still "drawing" this long after it was made had its worker crash or time out (the worker's limit is
 * 10 minutes): it is settled as needs_help, with the token given back, the next time anyone looks.
 */
export const STALE_DRAWING = 15 * MINUTE;


/** Ideas a family may try per hour (each is an art director call, kept or not). */
export const IDEAS_PER_HOUR = 30;

export const unavailable = () => new ApiError(503, 'unavailable', "Characters can't be made right now; try again in a minute (the token is kept)");
const noTokens = () => conflict('no_tokens', 'This kid has no character token: one comes with a job approved while the jar is full');

/**
 * The art director's call is hedged (src/ai/resilience.ts): Vertex's latency is bimodal (1–5 s, or 12–90 s), so another
 * attempt starts when none has answered for 3 s, 3 at once at most; with all three busy, a new one replaces the oldest
 * extra attempt (the first keeps running); 8 in all, and the whole call ends inside the API Lambda's 28 s.
 */
export const DIRECTOR_HEDGING: Hedging = {afterMs: 3000, maxInFlight: 3, maxAttempts: 8, deadlineMs: 25_000, rotate: true};

/** A final answer: a card that reads, or a no (the model's own refusal or safety block counts as one). */
const final = (reply: JsonReply) => reply.stop === 'refused' || reply.stop === 'blocked' || (reply.stop === 'done' && readDirection(reply.value) !== undefined);

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * The art director: the kid's words → a character card, or a kind no. Hedged attempts race; a cut-off or malformed
 * answer counts as a failed attempt; nothing usable by the deadline is a 503. Only attempt counts and timings are
 * logged, never the kid's words.
 */
export async function direct(model: AiModel, description: string, lang: Lang, hedging: Hedging = DIRECTOR_HEDGING): Promise<Direction> {
  const ask = {system: DIRECTOR_SYSTEM, user: directorUser(description, lang), schema: DIRECTOR_SCHEMA, name: 'character_card', maxTokens: 2048};
  try {
    const {value: reply, attempts, winner, ms, totalMs} = await hedge(signal => model.json({...ask, signal}), final, hedging);
    console.log(`art director (${model.id}): attempt ${winner} of ${attempts} answered in ${seconds(ms)} (${seconds(totalMs)} in all)`);
    return reply.stop === 'done' ? readDirection(reply.value, lang)! : {ok: false, sentence: NO_SENTENCE[lang]};
  } catch (error) {
    const why = error instanceof HedgeError
      ? `${error.reason === 'deadline' ? 'nothing before the deadline' : 'no usable answer'} in ${error.attempts} attempts; last: ${describe(error.last)}`
      : describe(error);
    console.error(`art director (${model.id}) failed: ${why}`);
    throw unavailable();
  }
}

/** An attempt's outcome for the log: an error's name and status, or a reply's stop. Never the prompt or the answer. */
function describe(outcome: unknown): string {
  if (outcome instanceof Error) return outcome.name + ('status' in outcome ? ` ${String(outcome.status)}` : '');
  const stop = (outcome as JsonReply | undefined)?.stop;
  return stop ? `answer ${stop === 'done' ? 'unreadable' : stop}` : 'none';
}

/**
 * POST /children/{childId}/characters: 409 no_tokens without a token; 429 too_many past IDEAS_PER_HOUR; 422
 * idea_not_ok (the art director's kind sentence); 503 unavailable when the models can't be reached (the token is kept
 * in all of these); else the character is stored as drawing, the token is used, and the drawing starts.
 */
export async function createCharacter(deps: Deps, family: Family, childId: string, input: CharacterInput) {
  const child = await deps.repo.getChild(family.id, childId);
  if (!child) throw notFound('child');
  if ((child.characterTokens ?? 0) < 1) throw noTokens();
  await takeHourly(deps, family.id, 'ideas', IDEAS_PER_HOUR, `This family tried ${IDEAS_PER_HOUR} ideas this hour; try again later (the token is kept)`);
  const direction = await direct(deps.director, input.description, family.lang);
  if (!direction.ok) throw new ApiError(422, 'idea_not_ok', direction.sentence);
  const character: Character = {
    id: newId(), childId, status: 'drawing', description: input.description, name: direction.name, voice: direction.voice, voiceStyle: direction.voiceStyle, card: direction.card,
    createdAt: deps.now(),
  };
  // Two ideas at once with one token: only one gets it.
  if ((await deps.repo.startCharacter(family.id, character)) === 'no_tokens') throw noTokens();
  deps.changed(family.id);
  try {
    await deps.startDrawing({familyId: family.id, characterId: character.id});
  } catch (error) {
    // Nothing was drawn: the character goes away and the token comes back.
    console.error(`starting the drawing failed: ${(error as Error).name}`);
    await deps.repo.removeCharacter(family.id, character);
    throw unavailable();
  }
  return characterView(character);
}

/** Characters whose drawing never finished (STALE_DRAWING) become needs_help, with the token given back. */
async function settleStale(deps: Deps, family: Family, characters: Character[]): Promise<Character[]> {
  const now = deps.now();
  return Promise.all(characters.map(async character => {
    if (character.status !== 'drawing' || now - character.createdAt < STALE_DRAWING) return character;
    if (await deps.repo.failCharacter(family.id, character)) deps.changed(family.id);
    return (await deps.repo.getCharacter(family.id, character.id)) ?? character;
  }));
}

/** GET /children/{childId}/characters: newest first, any status; ready ones with their SVG. */
export async function listCharacters(deps: Deps, family: Family, childId: string) {
  if (!(await deps.repo.getChild(family.id, childId))) throw notFound('child');
  const [characters, art] = await Promise.all([deps.repo.listCharacters(family.id, childId), deps.repo.listCharacterArt(family.id, childId)]);
  const pictures = new Map(art.map(a => [a.id, a]));
  const settled = await settleStale(deps, family, characters);
  return {characters: settled.sort(newestFirst).map(c => characterView(c, pictures.get(c.id)))};
}

/**
 * A grown-up removes a character, in any state. A drawing in progress is dropped (its worker stores nothing). The
 * token of a drawing or ready character goes back to the kid, exactly once; a needs_help one gave it back already.
 * Already gone is fine.
 */
export async function removeCharacter(deps: Deps, family: Family, childId: string, characterId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const character = isId(characterId) ? await deps.repo.getCharacter(family.id, characterId) : undefined;
    if (!character) return;
    if (character.childId !== childId) throw notFound('character');
    if (await deps.repo.removeCharacter(family.id, character)) {
      deps.changed(family.id);
      return;
    }
    // The worker finished or gave up at the same moment: look again.
  }
  throw busy();
}

/** GET /device/characters/{characterId}: a ready character's layers (never changes once ready). */
export async function characterArt(deps: Deps, family: Family, characterId: string) {
  const character = isId(characterId) ? await deps.repo.getCharacter(family.id, characterId) : undefined;
  const art = character?.status === 'ready' ? await deps.repo.getCharacterArt(family.id, characterId) : undefined;
  if (!character || !art) throw new ApiError(404, 'not_found', 'No such character, or it is not ready yet');
  return characterArtView(character, art);
}

/** The TV's list (DeviceState.characters): every kid's drawing and ready characters, newest first. */
export async function deviceCharacters(deps: Deps, family: Family) {
  const characters = await settleStale(deps, family, await deps.repo.listCharacters(family.id));
  return characters.filter(c => c.status !== 'needs_help').sort(newestFirst).map(deviceCharacterView);
}
