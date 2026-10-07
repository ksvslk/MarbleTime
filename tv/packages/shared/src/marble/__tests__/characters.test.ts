import type {CharacterArt, ServerCharacter, ServerState, Speech} from '../api';
import {isArt, isSpeech, lineFor, LINES, loadArt, mouthFrames, placer, playLine, riderOf} from '../characters';
import {applyServer, buddyOf, celebrationToShow, drawingFor, initialState, Link, reducer, restore, State, tokensOf, toSaved} from '../logic';

const now = Date.now();
const link: Link = {token: 't', deviceId: 'd', familyName: '', pin: null};
const paired: State = {...initialState, link};
const server: ServerState = {
  family: {id: 'f', name: 'Tamm', lang: 'en', caps: false, voice: true, pin: null},
  children: [
    {id: 'k1', name: 'Mia', avatar: 'bear', color: 'peach', age: 5, balanceSec: 0, dailyBaseMin: 30, dailyMaxMin: 60, characterTokens: 1},
    {id: 'k2', name: 'Leo', avatar: 'bunny', color: 'sky', age: 8, balanceSec: 0},
  ],
  chores: [],
  claims: [],
  today: '2026-10-07',
  serverTime: now,
};
const dragon: ServerCharacter = {id: 'ch1', childId: 'k1', status: 'ready', name: 'Pancake Dragon', voice: 'Leda', mood: 'silly', createdAt: now - 60_000};
const owl: ServerCharacter = {id: 'ch2', childId: 'k1', status: 'drawing', createdAt: now};
const ready = (c: ServerCharacter, name: string): ServerCharacter => ({...c, status: 'ready', name, voice: 'Fenrir'});
const sync = (s: State, characters: ServerCharacter[]) => applyServer(s, {...server, characters}, now);

describe('characters on a paired TV (docs/08)', () => {
  it('introduces a character once, when it is drawn; ones there at pairing are old news', () => {
    let s = sync(paired, [dragon]);
    expect(s.celebrations).toEqual([]);
    expect(s.seenCharacters).toEqual(['ch1']);
    s = sync(s, [dragon, owl]);
    expect([s.celebrations, drawingFor(s, 'k1'), drawingFor(s, 'k2')]).toEqual([[], true, false]);
    s = sync(s, [dragon, ready(owl, 'Rollerskate Owl')]);
    expect(s.celebrations).toEqual([{id: 'meet-ch2', kidId: 'k1', meet: 'ch2'}]);
    expect(drawingFor(s, 'k1')).toBe(false);
    expect(sync(s, [dragon, ready(owl, 'Rollerskate Owl')]).celebrations).toHaveLength(1);
  });

  it('says hello where the kid can see it, like other good news', () => {
    const s = sync(sync(sync(paired, []), [owl]), [ready(owl, 'Rollerskate Owl')]);
    expect(celebrationToShow({...s, screen: {name: 'who'}})).toEqual({id: 'meet-ch2', kidId: 'k1', meet: 'ch2'});
    expect(celebrationToShow({...s, screen: {name: 'board', kidId: 'k2'}})).toBeUndefined();
    expect(celebrationToShow({...s, screen: {name: 'board', kidId: 'k1'}})).toBeDefined();
  });

  it('never introduces a character a grown-up removed', () => {
    const s = sync(sync(sync(paired, []), [owl]), [ready(owl, 'Rollerskate Owl')]);
    const removed = sync(s, []);
    expect([removed.celebrations, removed.characters, removed.seenCharacters]).toEqual([[], [], []]);
  });

  it("the kid's newest ready character is the one by the jar", () => {
    const s = sync(paired, [dragon, ready(owl, 'Rollerskate Owl'), {...owl, id: 'ch3', createdAt: now + 1}]);
    expect(buddyOf(s, 'k1')?.id).toBe('ch2');
    expect(buddyOf(s, 'k2')).toBeUndefined();
    expect([tokensOf(s, 'k1'), tokensOf(s, 'k2')]).toEqual([1, 0]);
  });

  it('remembers characters and introductions across restarts; a fresh pairing or demo data has none', () => {
    const s = sync(sync(sync(paired, []), [owl]), [dragon, ready(owl, 'Rollerskate Owl')]);
    const back = restore(initialState, JSON.parse(JSON.stringify(toSaved(s))));
    expect([back.characters, back.seenCharacters, back.celebrations]).toEqual([s.characters, s.seenCharacters, s.celebrations]);
    expect(reducer(s, {type: 'linked', link}).characters).toEqual([]);
    expect(reducer(s, {type: 'setFamily', family: {kids: [], jobs: {}}}).characters).toEqual([]);
  });

  it('a backend from before characters has none', () => {
    expect(applyServer(paired, server, now).characters).toEqual([]);
  });
});

describe('what characters say: pre-written English lines', () => {
  it('picks the same line for the same moment, filled in', () => {
    expect(lineFor('meet', 'ch1', {kid: 'Mia', name: 'Pancake Dragon'})).toBe("Hi Mia! I'm Pancake Dragon!");
    expect(lineFor('marbles', 'k1:c1:2', {kid: 'Mia'})).toBe(lineFor('marbles', 'k1:c1:2', {kid: 'Mia'}));
    expect(LINES.en.marbles.map(l => l.replace('{kid}', 'Mia'))).toContain(lineFor('marbles', 'x', {kid: 'Mia'}));
    expect(lineFor('meet', 'ch1', {kid: 'Mia', name: 'Pannkoogidraakon'}, 'et')).toBe('Tere, Mia! Mina olen Pannkoogidraakon!');
  });
  it('playing: every press says the next line, all of them in turn', () => {
    const said = Array.from({length: LINES.en.play.length}, (_, n) => playLine('ch1', n, {kid: 'Mia', name: 'Rollie Dragon'}));
    expect(new Set(said).size).toBe(LINES.en.play.length);
    expect(playLine('ch1', LINES.en.play.length, {kid: 'Mia', name: 'Rollie Dragon'})).toBe(said[0]);
    expect(said).toContain("I'm Rollie Dragon!");
    // Without a name, the lines that need one are skipped.
    expect(Array.from({length: 20}, (_, n) => playLine('ch1', n, {kid: 'Mia'})).some(line => line.includes("I'm"))).toBe(false);
  });

  it('a character without a name just says hello, in the family language', () => {
    expect(lineFor('meet', 'ch1', {kid: 'Mia'})).toBe('Hi Mia!');
    expect(lineFor('meet', 'ch1', {kid: 'Mia'}, 'de')).toBe('Hallo, Mia!');
  });
  it('every language has every moment, and as many play lines', () => {
    const shape = (lang: keyof typeof LINES) => Object.entries(LINES[lang]).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]);
    for (const lang of ['et', 'de', 'es'] as const) expect(shape(lang)).toEqual(shape('en'));
  });
  it('every line fits the speech limit with the longest names', () => {
    for (const byMoment of Object.values(LINES))
      for (const lines of Object.values(byMoment))
        for (const line of [lines].flat()) expect(line.replace('{kid}', 'x'.repeat(24)).replace('{name}', 'y'.repeat(24)).length).toBeLessThanOrEqual(160);
  });
});

describe('drawing a character', () => {
  const speech: Speech = {
    audioUrl: 'https://cdn.example/a.mp3',
    durationMs: 900,
    visemes: [
      {time: 0, value: 'sil'},
      {time: 120, value: 'k'},
      {time: 120, value: 'a'},
      {time: 400, value: 'p'},
      {time: 520, value: 'u'},
    ],
  };

  it('the mouth is shut at the start and the end, and its keyframes always move forward in time', () => {
    const {times, open, wide} = mouthFrames(speech);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    expect([open[0], open[open.length - 1], times[times.length - 1]]).toEqual([0, 0, 900]);
    expect(open[times.indexOf(121)]).toBe(1); // "a": wide open, a millisecond after "k"
    expect(wide[times.indexOf(520)]).toBeLessThan(0); // "u": rounded
    expect([times.length, open.length, wide.length]).toEqual([7, 7, 7]);
  });

  it('Gemini lines: the mouth follows the loudness every step, shut at both ends', () => {
    const loud: Speech = {audioUrl: 'https://cdn.example/b.wav', durationMs: 200, mouth: {stepMs: 40, open: [0.2, 1, 0.5, 1.4]}};
    expect(mouthFrames(loud)).toEqual({times: [0, 40, 80, 120, 160, 200], open: [0, 0.2, 1, 0.5, 1, 0], wide: [0, 0, 0, 0, 0, 0]});
    expect(isSpeech(loud)).toBe(true);
    expect(isSpeech({...loud, mouth: {stepMs: 0, open: []}})).toBe(false);
  });

  it('an unknown viseme half-opens the mouth instead of breaking the line', () => {
    expect(mouthFrames({...speech, visemes: [{time: 10, value: '?'}]}).open).toEqual([0, 0.4, 0]);
  });

  it('places viewBox points in the drawing box, centred when the art is not square', () => {
    expect(placer('0 0 512 512', 256)([256, 512])).toEqual([128, 256]);
    expect(placer('0 0 400 200', 400)([0, 0])).toEqual([0, 100]);
    expect(placer('nonsense', 512)([10, 20])).toEqual([10, 20]);
  });

  const art: CharacterArt = {
    id: 'ch1',
    name: 'Pancake Dragon',
    voice: 'Leda',
    viewBox: '0 0 512 512',
    layers: [
      {part: 'body', pivot: [256, 490], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="300" r="150" fill="#7c6"/></svg>'},
      {svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"/>'},
    ],
  };

  it('moves a layer with the part it was drawn inside; older art rides the face and a hat on the head', () => {
    const neck: [number, number] = [256, 220];
    expect(riderOf({part: 'extra', parent: 'arm-right', svg: ''}, neck)).toBe('arm-right');
    expect(riderOf({part: 'eye-left', pivot: [228, 202], svg: ''}, neck)).toBe('head');
    expect(riderOf({part: 'extra', pivot: [256, 120], svg: ''}, neck)).toBe('head'); // a hat
    expect(riderOf({part: 'extra', pivot: [380, 400], svg: ''}, neck)).toBeUndefined(); // a tail
    expect(riderOf({part: 'head', pivot: neck, svg: ''}, neck)).toBeUndefined();
    expect(riderOf({part: 'head', parent: 'head', svg: ''}, neck)).toBeUndefined(); // the head cut around the face
  });

  it('accepts only art and speech it can use', () => {
    expect(isArt(art)).toBe(true);
    expect(isArt({...art, layers: []})).toBe(false);
    expect(isArt({...art, layers: [{part: 'head', pivot: [1], svg: '<svg/>'}]})).toBe(false);
    expect(isSpeech(speech)).toBe(true);
    expect(isSpeech({...speech, audioUrl: 'javascript:alert(1)'})).toBe(false);
  });

  it('fetches art once and keeps it; a failed fetch is tried again', async () => {
    const fetchMock = jest.fn();
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const answer = (status: number, body: unknown) => ({status, ok: status < 400, text: async () => JSON.stringify(body), headers: {get: () => null}});
    try {
      fetchMock.mockResolvedValueOnce(answer(500, {error: {code: 'oops', message: 'down'}}));
      expect(await loadArt('http://api', 't', 'ch1')).toBeNull();
      fetchMock.mockResolvedValueOnce(answer(200, art));
      expect(await loadArt('http://api', 't', 'ch1')).toEqual(art);
      expect(await loadArt('http://api', 't', 'ch1')).toEqual(art);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('http://api/device/characters/ch1');
      // Someone else's art under this id is refused.
      fetchMock.mockResolvedValueOnce(answer(200, {...art, id: 'other'}));
      expect(await loadArt('http://api', 't', 'ch9')).toBeNull();
    } finally {
      global.fetch = original;
    }
  });
});
