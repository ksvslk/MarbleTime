import {describe, expect, it} from 'vitest';
import {templateSvg} from '../src/ai/fake';
import {CHECK_SCHEMA, CHECK_SYSTEM, DRAWING_RULES} from '../src/domain/character-prompts';
import {MAX_ROUNDS} from '../src/domain/drawing';
import {CHANGED} from '../src/domain/realtime';
import {rasterize} from '../src/svg/rasterize';
import {family, jsonReply, MONDAY_NOON, textReply} from './helpers';

type Fixture = Awaited<ReturnType<typeof family>>;

const IDEA = 'Spiderman but a duck';
const CARD = {what: 'a duck superhero', colours: ['blue', 'yellow'], outfit: 'a lightning-bolt cape', mood: 'brave', detail: 'flies with an umbrella'};
const GOOD = templateSvg(['blue', 'yellow']);
/** The template with a stroke-only mouth and no legs: two problems the checks find. */
const FLAWED = GOOD.replace(/<g id="legs"[^>]*>.*?<\/g>/, '').replace('<path d="M230 202 Q256 234 282 202 Z" fill="#263238"/>', '<path d="M230 202 Q256 234 282 202" stroke="#263238" stroke-width="4" fill="none"/>');

/** Mia (with a token) asks for a character; the art director answers with CARD. */
async function drawingFor(f: Fixture) {
  await f.giveTokens(f.mia.id, 1);
  f.director.json$.push(jsonReply({answer: {result: 'character', name: 'Captain Quack', voice: 'Puck', card: CARD}}));
  const {body} = await f.mom.post(`/children/${f.mia.id}/characters`, {description: IDEA});
  return body as {id: string};
}

const character = async (f: Fixture, id: string) => (await f.mom.get(`/children/${f.mia.id}/characters`)).body.characters.find((c: {id: string}) => c.id === id);

describe('the drawing worker', () => {
  it('draws the card (never the kid\'s words), checks it, has the picture looked at, and stores the layers', async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    const [report] = await f.runDrawing();
    expect(report).toMatchObject({characterId: id, status: 'ready', rounds: [{kind: 'draw', problems: []}]});
    // The drawing prompt: the measured rules and the card; the kid's words never go to the drawing model.
    const prompt = f.artist.textAsks[0].user;
    expect(prompt.startsWith(DRAWING_RULES)).toBe(true);
    expect(prompt).toContain('- what: a duck superhero\n- colours: blue, yellow\n- outfit: a lightning-bolt cape\n- mood: brave\n- one fun detail: flies with an umbrella');
    expect(prompt).toContain('- name: Captain Quack (never write it in the picture)');
    expect(prompt).not.toMatch(/spiderman/i);
    expect(f.artist.textAsks[0].maxTokens).toBe(16000);
    // The picture check sees the rendered PNG and the card.
    const [look] = f.checker.jsonAsks;
    expect(look).toMatchObject({system: CHECK_SYSTEM, schema: CHECK_SCHEMA, name: 'picture_check'});
    expect(look.user).toContain('- what: a duck superhero');
    expect(look.images).toHaveLength(1);
    expect(look.images![0].subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(await character(f, id)).toMatchObject({status: 'ready', readyAt: MONDAY_NOON, svg: expect.stringContaining('<g id="mouth" data-pivot="256 212">')});
    const art = await f.repo.getCharacterArt(f.familyId, id);
    expect(art!.layers.map(l => l.part)).toEqual(['extra', 'legs', 'body', 'arm-left', 'arm-right', 'head', 'eye-left', 'eye-right', 'mouth']);
  });

  it('sends the checker\'s exact problems back with the SVG, and takes the corrected one', async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    f.artist.text$.push(textReply(`Here you go!\n\`\`\`svg\n${FLAWED}\n\`\`\``), textReply(GOOD));
    const [report] = await f.runDrawing();
    expect(report.status).toBe('ready');
    expect(report.rounds.map(r => r.kind)).toEqual(['draw', 'repair']);
    expect(report.rounds[0].problems).toEqual([
      'missing group id="legs"',
      'the mouth is only a line: draw it as a filled shape (fill not "none"), a dark closed or slightly open smile about 30–60 wide, so it can open and close to talk',
      'the character floats: its lowest point is at y=426; stand it on the floor with its feet between y=470 and y=500',
    ]);
    const repair = f.artist.textAsks[1].user;
    expect(repair).toContain(`Your previous SVG failed these checks:\n- ${report.rounds[0].problems.join('\n- ')}\n\nReturn the full corrected SVG.\n\nPrevious SVG:\n${FLAWED}`);
    // Only a drawing that passes the code checks is shown to the picture check.
    expect(f.checker.jsonAsks).toHaveLength(1);
    expect((await character(f, id)).status).toBe('ready');
  });

  it('draws again, with the reason, when the picture check says no', async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    f.checker.json$.push(jsonReply({ok: false, reason: 'The mask and web pattern copy Spider-Man; use an original costume.'}));
    const [report] = await f.runDrawing();
    expect(report.status).toBe('ready');
    expect(report.rounds.map(r => [r.kind, r.rejected])).toEqual([['draw', 'The mask and web pattern copy Spider-Man; use an original costume.'], ['redraw', undefined]]);
    const redraw = f.artist.textAsks[1].user;
    expect(redraw).toContain('A reviewer looked at your last drawing and turned it down: "The mask and web pattern copy Spider-Man; use an original costume."\nDraw a new SVG that fixes this.');
    expect(redraw).not.toContain('Previous SVG');
    expect((await character(f, id)).status).toBe('ready');
  });

  it(`gives up after ${MAX_ROUNDS} rounds: needs_help, the token back, the family told`, async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    const momConn = (await f.openRealtime({token: 'jwt-mom'}))!;
    expect((await f.child(f.mia.id)).characterTokens).toBe(0);
    f.artist.text$.push(textReply('<svg><g id="body">'), textReply(GOOD), textReply(FLAWED));
    f.checker.json$.push(jsonReply({ok: false, reason: 'Too scary: the teeth are sharp.'}));
    f.realtime.splice(0);
    const [report] = await f.runDrawing();
    expect(report.status).toBe('needs_help');
    expect(report.rounds.map(r => r.kind)).toEqual(['draw', 'repair', 'redraw']);
    expect(f.artist.textAsks).toHaveLength(MAX_ROUNDS);
    expect(f.checker.jsonAsks).toHaveLength(1);
    expect(await character(f, id)).toMatchObject({status: 'needs_help'});
    expect((await character(f, id)).svg).toBeUndefined();
    expect((await f.child(f.mia.id)).characterTokens).toBe(1);
    expect(f.realtime).toEqual([{connectionId: momConn, message: CHANGED}]);
    expect(await f.repo.getCharacterArt(f.familyId, id)).toBeUndefined();
  });

  it('counts a model that fails, refuses or is cut off as a round, and carries on', async () => {
    const f = await family();
    await drawingFor(f);
    const cut = GOOD.slice(0, 900);
    f.artist.text$.push(new Error('socket hang up'), textReply(cut, 'cut_off'), textReply(GOOD));
    const [report] = await f.runDrawing();
    expect(report.status).toBe('ready');
    expect(report.rounds[0].error).toBe('Error: socket hang up');
    expect(report.rounds[1].problems[0]).toBe('your answer was cut off before the end: keep the whole SVG under 12 KB');
    expect(report.rounds[1].problems[1]).toMatch(/^not valid XML: /);
    // A refusal makes the next round a fresh drawing.
    const g = await family();
    await drawingFor(g);
    g.artist.text$.push(textReply('', 'refused'));
    const [again] = await g.runDrawing();
    expect(again.rounds.map(r => [r.kind, r.error])).toEqual([['draw', 'no drawing (refused)'], ['draw', undefined]]);
    expect(g.artist.textAsks[1].user).not.toContain('Previous SVG');
  });

  it('checks where the character stands on the rendered picture', async () => {
    const f = await family();
    await drawingFor(f);
    // The template drawn 60 units higher: its feet float at y=420, and its hat reaches y=4.
    f.artist.text$.push(textReply(GOOD.replace('<g id="extra"', '<g transform="translate(0 -60)"><g id="extra"').replace('</svg>', '</g></svg>')));
    const [report] = await f.runDrawing({rasterize});
    expect(report.rounds[0].problems).toEqual([
      'the character floats: its lowest point is at y=420; stand it on the floor with its feet between y=470 and y=500',
      'the drawing reaches too high (y=4); keep everything below y=16',
    ]);
    expect(report.status).toBe('ready');
  });

  it('moves the drawing onto the floor in code when the last round still has only that wrong (pivots follow)', async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    const floating = GOOD.replace('<g id="extra"', '<g transform="translate(0 -60)"><g id="extra"').replace('</svg>', '</g></svg>');
    f.artist.text$.push(textReply(floating), textReply(floating), textReply(floating));
    const [report] = await f.runDrawing();
    expect(report.status).toBe('ready');
    expect(report.rounds.map(r => [r.kind, r.problems.length, r.moved])).toEqual([['draw', 2, undefined], ['repair', 2, undefined], ['repair', 0, 'translate(0 65)']]);
    const art = (await f.repo.getCharacterArt(f.familyId, id))!;
    expect(art.layers.find(l => l.part === 'legs')!.pivot).toEqual([256, 405]); // 400, up 60 by the model, down 65 by the code
    expect((await rasterize(art.svg)).box).toMatchObject({top: 69, bottom: 485});
    // A background can't be moved away: that stays a problem.
    const g = await family();
    await drawingFor(g);
    const boxed = GOOD.replace('<g id="extra"', '<rect width="512" height="512" fill="#e0f7fa"/><g id="extra"');
    g.artist.text$.push(textReply(boxed), textReply(boxed), textReply(boxed));
    const [stuck] = await g.runDrawing();
    expect(stuck.status).toBe('needs_help');
    expect(stuck.rounds[2].problems).toEqual(['remove the background: everything around the character must stay transparent (no full-size rectangle or scenery)']);
  });

  it('asks the picture check twice for a usable answer, then draws again', async () => {
    const f = await family();
    await drawingFor(f);
    f.checker.json$.push({stop: 'malformed', usage: f.noUsage}, jsonReply({verdict: 'fine'}));
    const [report] = await f.runDrawing();
    expect(report.rounds.map(r => [r.kind, r.error])).toEqual([['draw', 'the picture check gave no usable answer'], ['redraw', undefined]]);
    // A picture check that refuses to look counts as a no.
    const g = await family();
    await drawingFor(g);
    g.checker.json$.push({stop: 'blocked', usage: g.noUsage});
    const [blocked] = await g.runDrawing();
    expect(blocked.rounds[0].rejected).toMatch(/would not pass/);
  });

  it('leaves alone a character that is not drawing any more', async () => {
    const f = await family();
    const {id} = await drawingFor(f);
    await f.runDrawing();
    f.drawingJobs.push({familyId: f.familyId, characterId: id}, {familyId: f.familyId, characterId: 'gone'});
    expect((await f.runDrawing()).map(r => r.status)).toEqual(['skipped', 'skipped']);
  });
});
