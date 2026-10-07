/**
 * Making a kid's new character (docs/08, Decisions 4–5; /children/{id}/characters in backend/openapi.yaml):
 * the steps of the flow, what each API answer leads to, and showing the art safely. Pure, apart from the API
 * call it is given.
 */
import {ApiError, type Api} from '../api/client';
import type {Character} from '../api/types';

/** The kid's words, as the contract takes them (`description`, 1–200 characters). */
export const IDEA_MAX = 200;

export type Flow =
  /** Recording or typing the idea. `notOk`: the server's kind sentence for the kid after 422 (the token is kept). */
  | {step: 'idea'; words: string; notOk?: string}
  /** POST in flight: the art director reads the words (a few seconds). */
  | {step: 'sending'; words: string}
  /** Accepted (202); drawing and checking run on the server (about half a minute), then ready or needs_help. */
  | {step: 'drawing' | 'ready' | 'needs_help'; character: Character}
  /** 409: no character to make (someone else just made it). */
  | {step: 'no_tokens'};

/** The step a character's status puts the flow in. */
export function stepOf(character: Character): Flow {
  return {step: character.status, character};
}

/**
 * POST /children/{id}/characters, and the step that follows: drawing (202), back to the idea with the sentence
 * to read to the kid (422 `idea_not_ok`), or no character to make (409 `no_tokens`). Other errors are thrown.
 */
export async function sendIdea(api: Pick<Api, 'addCharacter'>, childId: string, words: string): Promise<Flow> {
  try {
    return stepOf(await api.addCharacter(childId, {description: words.trim()}));
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'idea_not_ok' || error.status === 422)) return {step: 'idea', words, notOk: error.message.trim()};
    if (error instanceof ApiError && (error.code === 'no_tokens' || error.status === 409)) return {step: 'no_tokens'};
    throw error;
  }
}

/**
 * The flow after a fresh list of the kid's characters: the character being drawn moves on when its status
 * changes. Until the list has it (a list read right after the POST may not), nothing changes.
 */
export function follow(flow: Flow, characters: readonly Character[]): Flow {
  if (flow.step !== 'drawing') return flow;
  const latest = characters.find(character => character.id === flow.character.id);
  return latest && latest.status !== 'drawing' ? stepOf(latest) : flow;
}

/** Whether any character is still being drawn (then the app looks again soon). */
export const anyDrawing = (characters: readonly Character[]) => characters.some(character => character.status === 'drawing');

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The art as an image address, for <img src>: a picture shown that way can't run scripts or load anything, and
 * it never becomes part of the page. An <svg> without its namespace doesn't draw as an image, so add it.
 */
export function svgDataUrl(svg: string): string {
  const text = svg.trim();
  const rootTag = /<svg\b[^>]*>/i.exec(text)?.[0];
  const withNs = !rootTag || /\sxmlns\s*=/i.test(rootTag) ? text : text.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
}
