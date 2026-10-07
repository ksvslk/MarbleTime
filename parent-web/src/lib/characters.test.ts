import {describe, expect, it, vi} from 'vitest';
import {ApiError, createApi} from '../api/client';
import type {Character} from '../api/types';
import {anyDrawing, follow, sendIdea, stepOf, svgDataUrl, type Flow} from './characters';

/** The API client against one canned answer, as the contract says the server gives it. */
function apiAnswering(status: number, body?: unknown) {
  const calls: {url: string; init: RequestInit}[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return new Response(body === undefined ? null : JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  });
  return {api: createApi({baseUrl: 'http://api.test', getToken: async () => 'dev-dad', fetch: fetch as unknown as typeof globalThis.fetch}), calls};
}

const character = (overrides: Partial<Character> = {}): Character => ({
  id: 'ch1',
  childId: 'k1',
  status: 'drawing',
  description: 'a dragon who loves pancakes',
  name: 'Pancake Dragon',
  card: {what: 'a dragon', colours: ['green', 'gold'], outfit: 'a chef’s hat', mood: 'happy', detail: 'loves pancakes'},
  voice: 'Puck',
  createdAt: 1,
  ...overrides,
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200" fill="#86E3B8"/></svg>';

describe('sending the kid’s idea', () => {
  it('202: drawing starts, with the words trimmed as the description', async () => {
    const {api, calls} = apiAnswering(202, character());
    const flow = await sendIdea(api, 'k1', '  a dragon who loves pancakes \n');
    expect(flow).toEqual({step: 'drawing', character: character()});
    expect(`${calls[0].init.method} ${calls[0].url}`).toBe('POST http://api.test/children/k1/characters');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({description: 'a dragon who loves pancakes'});
  });

  it('422 idea_not_ok: back to the idea, words kept, with the kind sentence to read to the kid', async () => {
    const message = 'Let’s make a brand-new hero of your own! What colour should it be?';
    const {api} = apiAnswering(422, {error: {code: 'idea_not_ok', message}});
    expect(await sendIdea(api, 'k1', 'Spiderman but a duck')).toEqual({step: 'idea', words: 'Spiderman but a duck', notOk: message});
  });

  it('409 no_tokens: there is no character to make', async () => {
    const {api} = apiAnswering(409, {error: {code: 'no_tokens', message: 'No character tokens'}});
    expect(await sendIdea(api, 'k1', 'a robot')).toEqual({step: 'no_tokens'});
  });

  it('anything else is an error for the screen to show (the words stay where they were)', async () => {
    const {api} = apiAnswering(500, {error: {code: 'internal', message: 'Oops'}});
    await expect(sendIdea(api, 'k1', 'a robot')).rejects.toBeInstanceOf(ApiError);
  });

  it('a server that was quick may already answer ready', async () => {
    const {api} = apiAnswering(202, character({status: 'ready', svg: SVG}));
    expect((await sendIdea(api, 'k1', 'a dragon')).step).toBe('ready');
  });
});

describe('following the drawing', () => {
  const drawing: Flow = {step: 'drawing', character: character()};

  it('moves on when the list says ready, with the art', () => {
    const ready = character({status: 'ready', svg: SVG, readyAt: 30_000});
    expect(follow(drawing, [character({id: 'other'}), ready])).toEqual({step: 'ready', character: ready});
  });

  it('moves on to needs_help when it couldn’t be drawn', () => {
    expect(follow(drawing, [character({status: 'needs_help'})]).step).toBe('needs_help');
  });

  it('keeps drawing while it is still drawing, or not in the list yet', () => {
    expect(follow(drawing, [character()])).toBe(drawing);
    expect(follow(drawing, [])).toBe(drawing);
  });

  it('leaves every other step alone', () => {
    const idea: Flow = {step: 'idea', words: 'a robot'};
    expect(follow(idea, [character({status: 'ready'})])).toBe(idea);
    expect(stepOf(character({status: 'needs_help'})).step).toBe('needs_help');
  });

  it('knows when anything is still being drawn', () => {
    expect(anyDrawing([character({status: 'ready'}), character()])).toBe(true);
    expect(anyDrawing([character({status: 'ready'}), character({status: 'needs_help'})])).toBe(false);
  });
});

describe('showing the art', () => {
  it('is an image address, never markup in the page', () => {
    const url = svgDataUrl(SVG);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(SVG);
    expect(url).not.toMatch(/[<>"]/);
  });

  it('adds the SVG namespace when it is missing (an image needs it), and only then', () => {
    const plain = '<?xml version="1.0"?>\n<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="10" height="10"/></svg>';
    const decoded = decodeURIComponent(svgDataUrl(plain).split(',')[1]);
    expect(decoded).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox');
    expect(decodeURIComponent(svgDataUrl(SVG).split(',')[1]).match(/xmlns=/g)).toHaveLength(1);
  });
});
