import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {problemsOf} from '../src/puzzles/items';
import {makePuzzleSet} from '../src/puzzles/daily';
import {afterSession, historyOf, pickSession, playLevels} from '../src/puzzles/pick';
import {draft, solve, write} from '../src/puzzles/writer';
import type {AiModel, JsonAsk} from '../src/ai/model';
import {DAY, family, testBank} from './helpers';

type F = Awaited<ReturnType<typeof family>>;
type Q = {id: string; subject: string; level: number; answer: number};
const session = async (f: F, childId: string) => (await f.tv.get(`/device/puzzles/session?childId=${childId}`)).body as {questions: Q[]; spare?: Q};
const finish = (f: F, childId: string, answers?: {id: string; right: boolean}[], id: string = randomUUID()) =>
  f.tv.post('/device/puzzles/results', {id, childId, ...(answers && {answers})});

describe('puzzles: a star for every finished round, five stars for a character, never TV time', () => {
  it('gives one star for finishing a round, whatever the score, and no TV time', async () => {
    const f = await family();
    const {questions} = await session(f, f.mia.id);
    const done = await finish(f, f.mia.id, questions.map(q => ({id: q.id, right: false})));
    expect(done.status).toBe(200);
    expect(done.body.puzzles).toMatchObject({on: true, stars: 1, starsNeeded: 5, doneToday: true});
    expect(done.body).toMatchObject({balanceSec: 0, leftTodaySec: 1800, characterTokens: 0});
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries).toEqual([]);
    // The TV and the phone see the same stars.
    const {body: state} = await f.tv.get('/device/state');
    expect(state.children.find((c: {id: string}) => c.id === f.mia.id).puzzles).toMatchObject({stars: 1, doneToday: true});
    expect((await f.child(f.leo.id)).puzzles).toMatchObject({stars: 0, doneToday: false});
  });

  it('gives a star for every finished round, the same day or the next, and counts a resend once', async () => {
    const f = await family();
    const id = randomUUID();
    await finish(f, f.mia.id, [], id);
    expect((await finish(f, f.mia.id, [], id)).body.puzzles).toMatchObject({stars: 1});
    // A second round the same day earns the second star.
    expect((await finish(f, f.mia.id)).body.puzzles).toMatchObject({stars: 2, doneToday: true});
    f.clock.now += DAY;
    expect((await f.child(f.mia.id)).puzzles).toMatchObject({stars: 2, doneToday: false});
    expect((await finish(f, f.mia.id)).body.puzzles).toMatchObject({stars: 3, doneToday: true});
  });

  it('turns the fifth star into a new character, and the stars start again: five rounds, on one day or over several', async () => {
    const f = await family();
    for (let round = 0; round < 4; round++) await finish(f, f.mia.id);
    expect(await f.child(f.mia.id)).toMatchObject({characterTokens: 0, puzzles: {stars: 4}});
    expect((await finish(f, f.mia.id)).body).toMatchObject({characterTokens: 1, puzzles: {stars: 0, doneToday: true}});
    f.clock.now += DAY;
    expect((await finish(f, f.mia.id)).body).toMatchObject({characterTokens: 1, puzzles: {stars: 1}});
  });

  it('lets a grown-up turn puzzles off for a kid, and checks what the TV sends', async () => {
    const f = await family();
    expect((await f.mom.patch(`/children/${f.mia.id}`, {puzzles: false})).body.puzzles).toMatchObject({on: false});
    expect((await finish(f, f.mia.id)).body.error.code).toBe('puzzles_off');
    expect((await f.tv.get(`/device/puzzles/session?childId=${f.mia.id}`)).body.error.code).toBe('puzzles_off');
    expect((await f.mom.patch(`/children/${f.mia.id}`, {puzzles: true})).body.puzzles).toMatchObject({on: true, stars: 0});
    expect((await finish(f, f.mia.id)).status).toBe(200);
    expect((await finish(f, 'nobody')).status).toBe(404);
    expect((await finish(f, f.leo.id, [{id: 'not-a-puzzle-id', right: true}])).status).toBe(400);
    const {body: ann} = await f.mom.post('/children', {name: 'Ann', avatar: 'bunny', color: 'mint', age: 7, puzzles: false});
    expect(ann.puzzles.on).toBe(false);
  });
});

describe('how the rounds went: kept for grown-ups', () => {
  it('keeps every finished round with its questions, newest first, once, and only for the family', async () => {
    const f = await family();
    expect((await f.mom.get(`/children/${f.mia.id}/puzzles`)).body).toEqual({rounds: []});
    const first = await session(f, f.mia.id);
    const id = randomUUID();
    await finish(f, f.mia.id, first.questions.map((q, i) => ({id: q.id, right: i !== 1})), id);
    await finish(f, f.mia.id, first.questions.map(q => ({id: q.id, right: true})), id); // the TV's outbox resends: not kept twice
    f.clock.now += 60_000;
    const second = await session(f, f.mia.id);
    await finish(f, f.mia.id, second.questions.map(q => ({id: q.id, right: true})));
    const {body} = await f.mom.get(`/children/${f.mia.id}/puzzles`);
    expect(body.rounds.map((r: {right: number; total: number}) => [r.right, r.total])).toEqual([[5, 5], [4, 5]]);
    expect((await f.child(f.mia.id)).puzzles.stars).toBe(2); // each of the two rounds earned its star
    expect(body.rounds[1].at).toBe(f.clock.now - 60_000);
    const bank = testBank('en');
    expect(body.rounds[1].answers).toEqual(first.questions.map((q, i) => ({subject: q.subject, level: q.level, right: i !== 1, prompt: bank.find(b => b.id === q.id)!.prompt})));
    // Another family's grown-up sees nothing of it; a kid who is removed takes the history along.
    const other = await family();
    expect((await other.mom.get(`/children/${f.mia.id}/puzzles`)).status).toBe(404);
    await f.mom.delete(`/children/${f.mia.id}`);
    expect(await f.repo.getPuzzleRounds(f.familyId, f.mia.id)).toEqual([]);
  });

  it('keeps the newest 30 rounds, and nothing for a round with no answers', async () => {
    const f = await family();
    await finish(f, f.leo.id); // an older TV sends no answers
    expect((await f.mom.get(`/children/${f.leo.id}/puzzles`)).body.rounds).toEqual([]);
    for (let i = 0; i < 32; i++) {
      f.clock.now += 60_000;
      const {questions} = await session(f, f.leo.id);
      await finish(f, f.leo.id, questions.slice(0, 1).map(q => ({id: q.id, right: i % 2 === 0})));
    }
    const {rounds} = (await f.mom.get(`/children/${f.leo.id}/puzzles`)).body;
    expect(rounds).toHaveLength(30);
    expect(rounds[0].at).toBe(f.clock.now);
  });

  it('gives the writer a kid\'s last answers in a subject, oldest first (historyOf)', () => {
    const round = (at: number, answers: [string, boolean, string][]) => ({at, answers: answers.map(([subject, right, prompt]) => ({subject: subject as 'logic', level: 1, right, prompt}))});
    const rounds = [round(1, [['logic', true, 'a'], ['words', false, 'b']]), round(2, [['logic', false, 'c'], ['logic', true, 'd']])];
    expect(historyOf(rounds, 'logic')).toEqual([{prompt: 'a', right: true}, {prompt: 'c', right: false}, {prompt: 'd', right: true}]);
    expect(historyOf(rounds, 'logic', 2)).toEqual([{prompt: 'c', right: false}, {prompt: 'd', right: true}]);
    expect(historyOf(rounds, 'world')).toEqual([]);
  });
});

describe('a kid\'s daily session from the bank', () => {
  it('is short, takes the subjects in turn at a step below the age, the same all day, with one easier spare', async () => {
    const f = await family();
    // Mia is 5: five questions at level 1. Leo is 8: ten at level 2 (a step below level 3).
    const mia = await session(f, f.mia.id);
    expect(mia.questions).toHaveLength(5);
    expect(new Set(mia.questions.map(q => q.level))).toEqual(new Set([1]));
    expect(new Set(mia.questions.map(q => q.subject)).size).toBe(4);
    expect(new Set(mia.questions.map(q => q.id)).size).toBe(5);
    expect(mia.spare).toMatchObject({level: 1, subject: mia.questions[4].subject});
    expect(mia.questions.map(q => q.id)).not.toContain(mia.spare!.id);
    expect(await session(f, f.mia.id)).toEqual(mia);
    const leo = await session(f, f.leo.id);
    expect([leo.questions.length, new Set(leo.questions.map(q => q.level))]).toEqual([10, new Set([2])]);
    expect(leo.spare?.level).toBe(1);
  });

  it('brings new questions the next day, and moves a subject up after three right in a row and down after a miss', async () => {
    const f = await family();
    const first = await session(f, f.leo.id);
    // Every logic and numbers answer right (three each among ten), a miss in words.
    const answers = first.questions.map(q => ({id: q.id, right: q.subject !== 'words'}));
    const {body: leo} = await finish(f, f.leo.id, answers);
    const turns = (subject: string) => first.questions.filter(q => q.subject === subject).length;
    expect(leo.puzzles.levels).toMatchObject({words: 1, ...(turns('logic') >= 3 && {logic: 3}), ...(turns('numbers') >= 3 && {numbers: 3})});
    f.clock.now += DAY;
    const second = await session(f, f.leo.id);
    expect(second.questions.filter(q => first.questions.some(old => old.id === q.id))).toEqual([]);
    expect(second.questions.filter(q => q.subject === 'words').every(q => q.level === 1)).toBe(true);
  });

  it('picks by the rules alone (pickSession, afterSession)', () => {
    const bank = testBank('en');
    const none = {levels: {}, streaks: {}, seen: []};
    // An empty bank gives an empty session; a bank with one subject uses it for every question.
    expect(pickSession([], 6, none, 'k|d')).toEqual({questions: []});
    expect(new Set(pickSession(bank.filter(q => q.subject === 'logic'), 6, none, 'k|d').questions.map(q => q.subject))).toEqual(new Set(['logic']));
    // When a level runs out, the nearest fills in, easier first; seen questions come back only when nothing is new.
    const thin = bank.filter(q => q.subject === 'logic' && q.level !== 2);
    expect(pickSession(thin, 8, none, 'k|d').questions.map(q => q.level)).toEqual(Array(6).fill(1).concat(Array(4).fill(3)));
    const few = bank.filter(q => q.subject === 'logic' && q.level === 1).slice(0, 5);
    const seenAll = pickSession(few, 5, {...none, seen: few.map(q => q.id)}, 'k|d');
    expect(seenAll.questions).toHaveLength(5);
    expect(seenAll.questions[0].id).toBe(few[0].id); // seen longest ago comes first
    // Levels stay inside 1…4, and answers to puzzles the bank no longer has change nothing.
    const start = {levels: {logic: 4, words: 1}, streaks: {logic: 2}, seen: []};
    const logic = bank.find(q => q.subject === 'logic')!;
    const words = bank.find(q => q.subject === 'words')!;
    const after = afterSession(bank, 8, start, [{id: logic.id, right: true}, {id: words.id, right: false}, {id: 'gone', right: false}]);
    expect(after).toEqual({levels: {logic: 4, words: 1}, streaks: {logic: 0, words: 0}, seen: [logic.id, words.id]});
    // A level a grown-up chose: every subject at it, and the answers move neither levels nor streaks (seen still counts).
    expect(playLevels({logic: 1}, 3)).toEqual({logic: 3, numbers: 3, words: 3, world: 3});
    expect(playLevels({logic: 1}, 0)).toEqual({logic: 1});
    expect(playLevels({logic: 1}, undefined)).toEqual({logic: 1});
    expect(afterSession(bank, 8, start, [{id: logic.id, right: true}, {id: words.id, right: false}], 2)).toEqual({...start, seen: [logic.id, words.id]});
  });

  it('lets a grown-up choose the level: every subject at it, the answers move nothing, and taking it back returns to where the kid was', async () => {
    const f = await family();
    // Leo (8) starts at level 2 by himself; a miss in words puts that subject at 1.
    const first = await session(f, f.leo.id);
    await finish(f, f.leo.id, first.questions.map(q => ({id: q.id, right: q.subject !== 'words'})));
    const before = (await f.child(f.leo.id)).puzzles.levels;
    expect(before.words).toBe(1);
    // Mum chooses level 4: the view says so, and who each level is written for.
    const {body: leo} = await f.mom.patch(`/children/${f.leo.id}`, {puzzleLevel: 4});
    expect(leo.puzzles).toMatchObject({level: 4, levelAges: ['4–5', '6', '7–8', '9–10'], levels: before});
    f.clock.now += DAY;
    const hard = await session(f, f.leo.id);
    expect(new Set(hard.questions.map(q => q.level))).toEqual(new Set([4]));
    expect(hard.spare?.level).toBe(3);
    // Every answer wrong at the chosen level: nothing moves.
    expect((await finish(f, f.leo.id, hard.questions.map(q => ({id: q.id, right: false})))).body.puzzles).toMatchObject({level: 4, levels: before});
    // Back to "follows the kid": where the answers had put him is in force again.
    expect((await f.mom.patch(`/children/${f.leo.id}`, {puzzleLevel: 0})).body.puzzles).toMatchObject({level: 0, levels: before});
    f.clock.now += DAY;
    const back = await session(f, f.leo.id);
    expect(back.questions.filter(q => q.subject === 'words').every(q => q.level === 1)).toBe(true);
    // Only 0…4, whole numbers.
    for (const puzzleLevel of [5, -1, 1.5, '2']) expect((await f.mom.patch(`/children/${f.leo.id}`, {puzzleLevel})).status).toBe(400);
    // A new kid can start with a chosen level; without one, it follows the kid.
    expect((await f.mom.post('/children', {name: 'Ada', avatar: 'bear', color: 'gold', age: 4, puzzleLevel: 2})).body.puzzles.level).toBe(2);
    expect(f.mia.puzzles.level).toBe(0);
  });
});

describe('a session written for the kid, on demand', () => {
  /** A stand-in writer: `count` fresh puzzles for whatever subject it is asked; and a solver that agrees with every one. */
  let made = 0;
  const writer: AiModel = {
    id: 'writer',
    async json(ask: JsonAsk) {
      if (ask.name !== 'puzzles') return {value: {pick: [...ask.user.matchAll(/Answer \d: (.*)/g)].map(m => m[1]).indexOf('yes'), sure: true, arguable: false, ageOk: true, languageOk: true, note: ''}, stop: 'done', usage: {inputTokens: 0, outputTokens: 0}};
      const count = Number(/Write (\d+) puzzles/.exec(ask.user)![1]);
      const items = Array.from({length: count}, () => ({prompt: `A fresh question number ${++made}?`, picture: [], choices: [{text: 'no', emoji: ''}, {text: 'yes', emoji: ''}, {text: 'maybe', emoji: ''}], answer: 1, reason: 'Because yes.'}));
      return {value: {items}, stop: 'done', usage: {inputTokens: 0, outputTokens: 0}};
    },
    async text() {
      throw new Error('not used');
    },
  };
  const run = (f: F, models: {writer?: AiModel; solvers?: AiModel[]} = {}) =>
    Promise.all(f.puzzleJobs.splice(0).map(job => makePuzzleSet({repo: f.repo, now: () => f.clock.now, writer: models.writer ?? writer, solvers: models.solvers ?? [writer, writer], bank: testBank}, job)));

  it('serves the bank until a written session is ready, then the written one until it is played, and starts the next', async () => {
    const f = await family();
    // The first ask comes from the bank, and starts the writing: one job per kid, however often the TV asks.
    const fromBank = await session(f, f.mia.id);
    await session(f, f.mia.id);
    expect(f.puzzleJobs.filter(job => job.childId === f.mia.id)).toHaveLength(1);
    const [report] = await run(f);
    expect(report).toMatchObject({status: 'ready', written: 5, fromBank: 0});
    // Now the kid gets the written session, the same one every time, with a spare from the bank.
    const written = await session(f, f.mia.id) as unknown as {questions: {id: string; prompt: string; subject: string; level: number}[]; spare?: {prompt: string}};
    expect(written.questions.map(q => q.prompt).every(p => p.startsWith('A fresh question'))).toBe(true);
    expect(written.questions.map(q => q.id)).not.toEqual(fromBank.questions.map(q => q.id));
    expect(new Set(written.questions.map(q => q.subject)).size).toBe(4);
    expect(new Set(written.questions.map(q => q.level))).toEqual(new Set([1]));
    expect(written.spare?.prompt).not.toMatch(/fresh/);
    expect(await session(f, f.mia.id)).toEqual(written);
    expect(f.puzzleJobs).toEqual([]);
    // Playing it moves the kid's levels (its puzzles are in no bank), uses it up and starts the next one.
    const {body: mia} = await finish(f, f.mia.id, written.questions.map(q => ({id: q.id, right: q.subject !== 'words'})));
    expect(mia.puzzles).toMatchObject({stars: 1, doneToday: true, levels: {words: 1}});
    expect(f.puzzleJobs.map(job => job.childId)).toEqual([f.mia.id]);
    // A second round the same day: from the bank until the next written session is ready, and it earns its star too.
    const second = await session(f, f.mia.id);
    expect(second.questions).toHaveLength(5);
    expect(second.questions.some(q => written.questions.some(w => w.id === q.id))).toBe(false);
    expect((await finish(f, f.mia.id, second.questions.map(q => ({id: q.id, right: true})))).body.puzzles).toMatchObject({stars: 2});
    await run(f);
    const next = await session(f, f.mia.id) as unknown as {questions: {prompt: string}[]};
    expect(next.questions.every(q => q.prompt.startsWith('A fresh question'))).toBe(true);
    expect(next.questions.some(q => written.questions.some(w => w.prompt === q.prompt))).toBe(false);
  });

  it('shows the writer how the kid did on their last questions, so the next session is pitched to the kid; not with a chosen level', async () => {
    const f = await family();
    const asks: string[] = [];
    const listening: AiModel = {...writer, json: async ask => {
      if (ask.name === 'puzzles') asks.push(ask.user);
      return writer.json(ask);
    }};
    // The first written session has no history to go by: the age band alone.
    await session(f, f.mia.id);
    await run(f, {writer: listening, solvers: [writer]});
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every(user => /Not easier than that, not harder\./.test(user) && !/how that child did/.test(user))).toBe(true);
    // Mia plays it: words missed, the rest right. The next one is written with that in view.
    const played = await session(f, f.mia.id) as unknown as {questions: {id: string; subject: string; prompt: string}[]};
    await finish(f, f.mia.id, played.questions.map(q => ({id: q.id, right: q.subject !== 'words'})));
    asks.length = 0;
    await run(f, {writer: listening, solvers: [writer]});
    const words = asks.find(user => user.includes('Subject: words'))!;
    const missed = played.questions.find(q => q.subject === 'words')!;
    expect(words).toContain(`- missed: ${missed.prompt}`);
    expect(words).toMatch(/about four in five come out right/);
    expect(words).not.toMatch(/Not easier than that, not harder\./);
    const logic = asks.find(user => user.includes('Subject: thinking puzzles'))!;
    expect(logic).toContain(`- right: ${played.questions.find(q => q.subject === 'logic')!.prompt}`);
    // A level a grown-up chose is kept as it is: no history for the writer.
    asks.length = 0;
    await f.mom.patch(`/children/${f.mia.id}`, {puzzleLevel: 2});
    await run(f, {writer: listening, solvers: [writer]});
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every(user => /Not easier than that, not harder\./.test(user) && !/how that child did/.test(user))).toBe(true);
  });

  it('drops a session written at the old level when a grown-up changes the level, and writes the next at the new one', async () => {
    const f = await family();
    await session(f, f.mia.id);
    await run(f);
    const old = await session(f, f.mia.id) as unknown as {questions: {prompt: string; level: number}[]};
    expect(old.questions.every(q => q.prompt.startsWith('A fresh question') && q.level === 1)).toBe(true);
    await f.mom.patch(`/children/${f.mia.id}`, {puzzleLevel: 3});
    expect(f.puzzleJobs.map(job => job.childId)).toEqual([f.mia.id]);
    // Until the new one is written the bank serves the chosen level.
    expect(new Set((await session(f, f.mia.id)).questions.map(q => q.level))).toEqual(new Set([3]));
    await run(f);
    const next = await session(f, f.mia.id) as unknown as {questions: {prompt: string; level: number}[]};
    expect(next.questions.every(q => q.prompt.startsWith('A fresh question') && q.level === 3)).toBe(true);
    // Saving the same level again keeps the session that is waiting.
    await f.mom.patch(`/children/${f.mia.id}`, {puzzleLevel: 3});
    expect(f.puzzleJobs).toEqual([]);
    expect(await session(f, f.mia.id)).toEqual(next);
  });

  it('fills places the writer couldn\'t from the bank, keeps nothing when the writer made nothing, and never throws', async () => {
    const f = await family();
    await session(f, f.mia.id);
    // A solver that doubts everything about numbers: those places come from the bank.
    const picky: AiModel = {...writer, json: async ask => {
      const reply = await writer.json(ask);
      return ask.name === 'verdict' ? {...reply, value: {...(reply.value as object), arguable: Number(/number (\d+)/.exec(ask.user)![1]) % 2 === 0}} : reply;
    }};
    const [mixed] = await run(f, {solvers: [picky]});
    expect(mixed.status).toBe('ready');
    expect(mixed.written).toBeGreaterThan(0);
    expect(mixed.written + mixed.fromBank).toBe(5);
    expect(mixed.dropped.length).toBeGreaterThan(0);
    // A writer that can't be reached: the kid still has the bank, and writing can be tried again later.
    const g = await family();
    await session(g, g.leo.id);
    const down: AiModel = {...writer, json: async () => Promise.reject(new Error('503'))};
    const [failed] = await run(g, {writer: down});
    expect(failed).toMatchObject({status: 'failed', written: 0});
    expect((await session(g, g.leo.id)).questions).toHaveLength(10);
    // Puzzles turned off: nothing is written, and a waiting job does nothing.
    const h = await family();
    await session(h, h.mia.id);
    await h.mom.patch(`/children/${h.mia.id}`, {puzzles: false});
    expect((await run(h))[0]).toMatchObject({status: 'skipped'});
  });
});

describe('writing puzzles with a model: only what every check passes is kept', () => {
  const good = {prompt: 'Which one barks?', picture: [], choices: [{text: 'a cat'}, {text: 'a dog'}, {text: 'a fish'}], answer: 1, reason: 'A dog barks.'};

  it('refuses what a screen can\'t show or isn\'t a fair choice (problemsOf)', () => {
    expect(problemsOf(good)).toEqual([]);
    expect(problemsOf({...good, picture: ['🐶', '🐱']})).toEqual([]);
    expect(problemsOf({...good, choices: [{emoji: '🐱'}, {emoji: '🐶'}, {emoji: '🐟'}]})).toEqual([]);
    expect(problemsOf({...good, choices: good.choices.slice(0, 2)})).toEqual(['exactly three answers']);
    expect(problemsOf({...good, choices: [{text: 'a dog'}, {text: 'A DOG'}, {text: 'a fish'}]})).toEqual(['the three answers must differ']);
    expect(problemsOf({...good, choices: [{emoji: '🐱'}, {text: 'a dog'}, {text: 'a fish'}]})).toEqual(['the three answers must be all words or all pictures']);
    expect(problemsOf({...good, picture: ['🌰']})[0]).toContain('not in the allowed set');
    expect(problemsOf({...good, answer: 3})).toEqual(['the right answer must be place 0, 1 or 2']);
    expect(problemsOf({...good, prompt: 'Hm?'})).toEqual(['the question must be 6–110 characters']);
    expect(problemsOf({...good, choices: [{text: 'a very long answer indeed, too long'}, {text: 'a dog'}, {text: 'a fish'}]})).toEqual(['an answer is longer than 22 characters']);
  });

  /** A stand-in model: writes the given drafts; as a solver, always picks the answer `key` says for the question. */
  const model = (id: string, drafts: unknown[], pickFor: (question: string, shown: string[]) => {pick: number; sure?: boolean; arguable?: boolean; ageOk?: boolean; languageOk?: boolean}): AiModel => ({
    id,
    async json(ask: JsonAsk) {
      if (ask.name === 'puzzles') return {value: {items: drafts}, stop: 'done', usage: {inputTokens: 0, outputTokens: 0}};
      const question = /Question: (.*)/.exec(ask.user)![1];
      const shown = [...ask.user.matchAll(/Answer \d: (.*)/g)].map(m => m[1]);
      const verdict = pickFor(question, shown);
      return {value: {sure: true, arguable: false, ageOk: true, languageOk: true, note: '', ...verdict}, stop: 'done', usage: {inputTokens: 0, outputTokens: 0}};
    },
    async text() {
      throw new Error('not used');
    },
  });
  const ask = {lang: 'en' as const, subject: 'logic' as const, level: 2, count: 3, have: []};

  it('shows a solver only what the kid sees, in a fresh order, and keeps an item every solver agrees with', async () => {
    const seen: string[] = [];
    const honest = model('solver', [], (_, shown) => ({pick: shown.indexOf('a dog')}));
    const spy: AiModel = {...honest, json: async a => (seen.push(a.user), honest.json(a))};
    expect(await solve(spy, good, 'en', 2, [2, 0, 1])).toEqual({ok: true});
    expect(seen[0]).toContain('Answer 0: a fish\nAnswer 1: a cat\nAnswer 2: a dog');
    expect(seen[0]).not.toContain('A dog barks');
    const writer = model('writer', [{...good, choices: good.choices.map(c => ({...c, emoji: ''}))}], () => ({pick: 0}));
    const {accepted, rejected} = await write(writer, [honest, honest, honest], ask, new Date('2026-10-12T10:00:00Z'));
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([{...good, id: accepted[0].id, lang: 'en', subject: 'logic', level: 2, source: {by: 'ai', model: 'writer', solvers: 'solver, solver, solver', at: '2026-10-12'}}]);
    expect(accepted[0].id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('drops an item on one disagreement or one doubt, a broken shape, or a repeat; and tidies what a writer sends', async () => {
    const wrongKey = {...good, prompt: 'Which one meows?', answer: 1};
    const repeat = {...good, prompt: 'Which one  BARKS?'};
    const broken = {...good, prompt: 'Which one swims?', choices: good.choices.slice(0, 2)};
    const doubted = {...good, prompt: 'Which one is nicest?'};
    const writer = model('writer', [good, wrongKey, repeat, broken, doubted], () => ({pick: 0}));
    const solver = model('solver', [], (question, shown) => (
      question.includes('meows') ? {pick: shown.indexOf('a cat')} : question.includes('nicest') ? {pick: shown.indexOf('a dog'), arguable: true} : {pick: shown.indexOf('a dog')}
    ));
    const {accepted, rejected} = await write(writer, [solver, solver], ask);
    expect(accepted.map(item => item.prompt)).toEqual(['Which one barks?']);
    expect(rejected.map(r => r.why.split(':')[0]).sort()).toEqual(['a solver picked "a cat"', 'already in the bank', 'arguable', 'exactly three answers']);
    // A solver that can't be reached drops the item too.
    const down: AiModel = {...solver, json: async () => Promise.reject(new Error('503'))};
    expect((await write(writer, [solver, down], ask)).accepted).toEqual([]);
    // Emoji come back bare (no "show as a picture" mark), text trimmed.
    const messy = model('writer', [{prompt: ' Which one flies? ', picture: ['🐦️'], choices: [{text: '', emoji: '🐦️'}, {text: '', emoji: '🐟'}, {text: '', emoji: '🐶'}], answer: 0, reason: ' A bird flies. '}], () => ({pick: 0}));
    expect(await draft(messy, ask)).toEqual([{prompt: 'Which one flies?', picture: ['🐦'], choices: [{emoji: '🐦'}, {emoji: '🐟'}, {emoji: '🐶'}], answer: 0, reason: 'A bird flies.'}]);
  });
});
