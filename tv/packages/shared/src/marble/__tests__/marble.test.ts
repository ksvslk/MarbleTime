import * as fs from 'fs';
import * as path from 'path';
import {JOB_ICONS, SAMPLE_FAMILY} from '../data';
import {LANGS, STRINGS, t} from '../i18n';
import {CAPS_WIDTH, fitFontSize, linesNeeded} from '../fit';
import type {ServerState} from '../api';
import {
  afterAnswer,
  applyServer, celebrationToShow, checkPin, defaultDailyMax, firstSyncPending, givenFor, givesOf, initialState, isDone, jarFull, jarRoom, jarSize, Link, localDay, marblesIn,
  needsPairing, normalKid, notYetToday, puzzlesOf, reducer, restore, rewardFor, screenTimeKid, State, stillPicked, takenToday, timeToday, toSaved,
  bedtimeMinutes, inBedtime,
} from '../logic';
import {sha256Hex} from '../sha256';
import {spokenLines, voiceKey} from '../voiceLines';
import {VOICES} from '../voices';

/** The sample family as a test link loads it: Mia (5) has a 60-minute ceiling and a 30-minute base, Leo (8) 90 and 40. */
const sample: State = reducer(initialState, {type: 'setFamily', family: SAMPLE_FAMILY, balances: {mia: 10, leo: 20}});

/** A kid claims a job and a grown-up says yes on the TV. */
function approve(s: State, kidId: string, jobId: string): State {
  const claimed = reducer(s, {type: 'claim', kidId, jobId});
  const claim = claimed.claims.find(c => c.kidId === kidId && c.jobId === jobId && c.status === 'waiting')!;
  return reducer(claimed, {type: 'decide', claimId: claim.id, yes: true});
}
const mia = (s: State) => s.claims.filter(c => c.kidId === 'mia');

describe('today’s jar: a budget with a ceiling (docs/08)', () => {
  it('holds the base plus what was earned, never more than the ceiling', () => {
    expect([timeToday(sample, 'mia'), jarSize(sample, 'mia'), jarRoom(sample, 'mia')]).toEqual([40, 6, 20]);
    expect(timeToday({...sample, balances: {mia: 999}}, 'mia')).toBe(60);
  });

  it('one marble is ten minutes', () => {
    expect([marblesIn(40), marblesIn(39), marblesIn(-5)]).toEqual([4, 3, 0]);
  });

  it('a claim waits for a grown-up and adds no time on its own', () => {
    const s = reducer(sample, {type: 'claim', kidId: 'mia', jobId: 'toys'});
    expect([mia(s).map(c => c.status), s.balances.mia]).toEqual([['waiting'], 10]);
  });

  it('"Yes" puts the job’s marbles in the jar and celebrates; "Not yet" adds nothing', () => {
    const yes = approve(sample, 'mia', 'cat'); // 20 minutes, and 20 fit
    expect(yes.balances.mia).toBe(30);
    expect(mia(yes)[0]).toMatchObject({status: 'approved', reward: 'marbles', minutesCredited: 20});
    expect(yes.celebrations).toEqual([{id: mia(yes)[0].id, kidId: 'mia', marbles: 2, why: {kind: 'job', jobId: 'cat', reward: 'marbles'}}]);
    const claimed = reducer(sample, {type: 'claim', kidId: 'mia', jobId: 'cat'});
    const no = reducer(claimed, {type: 'decide', claimId: claimed.claims[0].id, yes: false});
    expect([no.balances.mia, no.celebrations.length, no.claims[0].status]).toEqual([10, 0, 'rejected']);
  });

  it('a job that only partly fits fills the jar and earns a new character for the rest; a full jar gives the character alone', () => {
    const almost: State = {...sample, balances: {...sample.balances, mia: 20}}; // 30 + 20 = 50 of 60: one marble fits
    const partly = approve(almost, 'mia', 'cat'); // a 20-minute job
    expect(mia(partly)[0]).toMatchObject({promised: {reward: 'character', minutes: 10}, reward: 'character', minutesCredited: 10});
    expect([timeToday(partly, 'mia'), jarFull(partly, 'mia')]).toEqual([60, true]);
    expect(partly.family.kids.find(k => k.id === 'mia')?.characterTokens).toBe(1);
    expect(partly.celebrations[0]).toMatchObject({marbles: 1, why: {kind: 'job', jobId: 'cat', reward: 'character'}});
    const extra = approve(partly, 'mia', 'toys');
    expect(extra.balances.mia).toBe(partly.balances.mia);
    expect(extra.family.kids.find(k => k.id === 'mia')?.characterTokens).toBe(2);
    expect(extra.celebrations[extra.celebrations.length - 1]).toMatchObject({marbles: 0, why: {kind: 'job', jobId: 'toys', reward: 'character'}});
  });

  it('what the card showed at "I did it!" is what a yes gives: waiting jobs hold their room', () => {
    const job = (id: string) => SAMPLE_FAMILY.jobs.mia.find(j => j.id === id)!;
    // Mia has room for two marbles. The cat (2 marbles) is claimed first, so the toys card (1 marble) now shows a character.
    expect(givesOf(sample, 'mia', job('toys'))).toEqual({reward: 'marbles', minutes: 10});
    const cat = reducer(sample, {type: 'claim', kidId: 'mia', jobId: 'cat'});
    expect(givesOf(cat, 'mia', job('cat'))).toEqual({reward: 'marbles', minutes: 20});
    expect(givesOf(cat, 'mia', job('toys'))).toEqual({reward: 'character', minutes: 0});
    const both = reducer(cat, {type: 'claim', kidId: 'mia', jobId: 'toys'});
    const [catClaim, toysClaim] = ['cat', 'toys'].map(id => both.claims.find(c => c.jobId === id)!);
    // Toys is approved first: it still gives the character it showed, and the cat still gets its two marbles.
    const toysDone = reducer(both, {type: 'decide', claimId: toysClaim.id, yes: true});
    expect(toysDone.claims.find(c => c.id === toysClaim.id)).toMatchObject({reward: 'character', minutesCredited: 0});
    const catDone = reducer(toysDone, {type: 'decide', claimId: catClaim.id, yes: true});
    expect(catDone.claims.find(c => c.id === catClaim.id)).toMatchObject({reward: 'marbles', minutesCredited: 20});
    expect([catDone.balances.mia, timeToday(catDone, 'mia')]).toEqual([30, 60]);
    // A "not yet" frees the room for the next card.
    const catNo = reducer(both, {type: 'decide', claimId: catClaim.id, yes: false, reason: 'not_finished'});
    expect(catNo.claims.find(c => c.id === catClaim.id)).toMatchObject({status: 'rejected', notYetReason: 'not_finished'});
    expect(rewardFor(catNo, 'mia', job('cat'))).toEqual({reward: 'marbles', minutes: 20});
  });

  it('a promise never goes over the jar: if it filled meanwhile, the rest is a character', () => {
    const claimed = reducer(sample, {type: 'claim', kidId: 'mia', jobId: 'cat'});
    const fuller: State = {...claimed, balances: {...claimed.balances, mia: 20}}; // a bonus came in: one marble of room left
    expect(givenFor(fuller, fuller.claims[0])).toEqual({reward: 'character', minutes: 10});
    const done = reducer(fuller, {type: 'decide', claimId: fuller.claims[0].id, yes: true});
    expect([done.balances.mia, done.family.kids.find(k => k.id === 'mia')?.characterTokens]).toEqual([30, 1]);
  });

  it('the jar is the time left: watched time leaves it (base first), and what was watched can\'t be earned again today', () => {
    // Mia: a 60-minute jar, 30 given, 10 earned. She watched 20 minutes of the base.
    const watched: State = {...sample, used: {mia: {baseMin: 20, earnedMin: 0}}};
    expect([timeToday(watched, 'mia'), jarRoom(watched, 'mia'), jarSize(watched, 'mia')]).toEqual([20, 20, 4]);
    // Later she watched the rest of the base and her earned marble: nothing left, two marbles still to earn.
    const empty: State = {...sample, balances: {...sample.balances, mia: 0}, used: {mia: {baseMin: 30, earnedMin: 10}}};
    expect([timeToday(empty, 'mia'), jarRoom(empty, 'mia'), jarSize(empty, 'mia'), jarFull(empty, 'mia')]).toEqual([0, 20, 2, false]);
    // The backend's seconds become minutes, left rounded down and watched rounded up.
    const server = applyServer({...initialState, link: {token: 't', deviceId: 'd', familyName: 'F'} as Link}, {
      family: {id: 'f', name: 'F', lang: 'en', caps: false, voice: true, pin: null},
      children: [{id: 'k1', name: 'Mia', avatar: 'bear', color: 'gold', age: 5, balanceSec: 300, dailyBaseMin: 30, dailyMaxMin: 60, usedTodaySec: 2100, leftTodaySec: 300}],
      chores: [], claims: [], today: '2026-10-12', serverTime: 0,
    }, 0);
    expect(server.used.k1).toEqual({baseMin: 30, earnedMin: 5});
    expect([timeToday(server, 'k1'), jarRoom(server, 'k1')]).toEqual([5, 20]);
  });

  it('counts and locks only when the grown-ups set this TV to strict mode, from the backend\'s seconds left', () => {
    const server = (mode: 'strict' | 'amazon_kids') => applyServer({...initialState, link: {token: 't', deviceId: 'd', familyName: 'F'} as Link}, {
      family: {id: 'f', name: 'F', lang: 'en', caps: false, voice: true, pin: null}, device: {id: 'd', name: 'TV', mode},
      children: [{id: 'k1', name: 'Mia', avatar: 'bear', color: 'gold', age: 5, balanceSec: 0, dailyBaseMin: 30, dailyMaxMin: 60, usedTodaySec: 30, leftTodaySec: 1770}],
      chores: [], claims: [], today: '2026-10-12', serverTime: 0,
    }, 0);
    expect([server('strict').strict, server('amazon_kids').strict, server('strict').leftSec]).toEqual([true, false, {k1: 1770}]);
  });

  it('who is watching: a kid whose jar ran out since being picked drops out, so a sibling with time can still watch', () => {
    const left: Record<string, number> = {mia: 600, leo: 0, ada: 59};
    expect(stillPicked(['leo', 'mia', 'ada'], kidId => (left[kidId] ?? 0) >= 60)).toEqual(['mia']);
    expect(stillPicked([], () => true)).toEqual([]);
  });

  it('bedtime: a kid’s bedtime is in the TV’s local time and may run past midnight', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 19, h, m).getTime();
    const night = {bedtime: {from: '19:30', to: '07:00'}};
    expect([at(19, 29), at(19, 30), at(23, 59), at(0, 0), at(6, 59), at(7, 0), at(12, 0)].map(time => inBedtime(night, time)))
      .toEqual([false, true, true, true, true, false, false]);
    expect([at(13, 0), at(15, 0)].map(time => inBedtime({bedtime: {from: '13:00', to: '15:00'}}, time))).toEqual([true, false]);
    expect(inBedtime({}, at(21, 0))).toBe(false);
    expect(bedtimeMinutes(night)).toEqual({bedFrom: 19 * 60 + 30, bedTo: 7 * 60});
  });

  it('a right answer gets "Yes!" and no explanation; a miss gets the reason, with no word about the miss', () => {
    const words = {yes: 'Yes!', look: 'Look:', reason: 'A dog barks.'};
    expect(afterAnswer(true, words)).toEqual({lead: 'Yes!', text: '', say: ['Yes!']});
    expect(afterAnswer(false, words)).toEqual({lead: 'Look:', text: 'A dog barks.', say: ['A dog barks.']});
  });
  it('every finished puzzle round earns a star, the fifth star a new character, and never TV time', () => {
    const on = {on: true, stars: 0, starsNeeded: 5, doneToday: false, levels: {}};
    const paired: State = {...sample, link: {token: 't', deviceId: 'd', familyName: 'F'} as Link, puzzles: {mia: on}};
    const answers = [{id: 'aaaaaaaaaaaaaaaa', right: true}, {id: 'bbbbbbbbbbbbbbbb', right: false}];
    const first = reducer(paired, {type: 'puzzleDone', kidId: 'mia', answers});
    expect(puzzlesOf(first, 'mia')).toEqual({...on, stars: 1, doneToday: true});
    // The screen that ends the round knows how each question went.
    expect(first.screen).toEqual({name: 'puzzleDone', kidId: 'mia', star: true, character: false, marks: answers.map(a => a.right)});
    // The kid's first answers go to the backend, which moves their levels.
    expect(first.outbox).toEqual([{kind: 'puzzle', id: first.outbox[0].id, childId: 'mia', answers}]);
    expect([first.balances.mia, timeToday(first, 'mia')]).toEqual([sample.balances.mia, timeToday(sample, 'mia')]);
    // A second round the same day earns the second star.
    const again = reducer(first, {type: 'puzzleDone', kidId: 'mia', answers: []});
    expect([puzzlesOf(again, 'mia').stars, again.screen]).toEqual([2, {name: 'puzzleDone', kidId: 'mia', star: true, character: false, marks: []}]);
    // The last star needed becomes a character token, and the stars start again.
    const almost: State = {...paired, puzzles: {mia: {...on, stars: 4}}};
    const fifth = reducer(almost, {type: 'puzzleDone', kidId: 'mia', answers: []});
    expect([puzzlesOf(fifth, 'mia').stars, fifth.family.kids.find(k => k.id === 'mia')?.characterTokens, fifth.screen]).toEqual([0, 1, {name: 'puzzleDone', kidId: 'mia', star: true, character: true, marks: []}]);
    // The backend's stars and levels replace the TV's, except while a finished session is still on its way there.
    const fromServer = (state: State) => applyServer(state, {
      family: {id: 'f', name: 'F', lang: 'en', caps: false, voice: true, pin: null},
      children: [{id: 'mia', name: 'Mia', avatar: 'bear', color: 'gold', age: 5, balanceSec: 0, puzzles: {on: true, stars: 3, starsNeeded: 5, doneToday: false, levels: {logic: 2}}}],
      chores: [], claims: [], today: '2026-10-12', serverTime: 0,
    }, 0);
    expect(puzzlesOf(fromServer(first), 'mia').stars).toBe(1);
    expect(puzzlesOf(fromServer({...first, outbox: []}), 'mia')).toMatchObject({stars: 3, levels: {logic: 2}});
    // Puzzles come from the backend's bank: an unpaired TV, or a backend from before puzzles, shows no puzzle card.
    expect(puzzlesOf(sample, 'mia').on).toBe(false);
    const old = applyServer(paired, {family: {id: 'f', name: 'F', lang: 'en', caps: false, voice: true, pin: null}, children: [{id: 'mia', name: 'Mia', avatar: 'bear', color: 'gold', age: 5, balanceSec: 0}], chores: [], claims: [], today: '2026-10-12', serverTime: 0}, 0);
    expect(puzzlesOf(old, 'mia').on).toBe(false);
  });

  it('time in puzzles and with characters is TV time: it leaves the jar (base first) and is reported; the board is free', () => {
    expect([{name: 'puzzle', kidId: 'mia'}, {name: 'puzzleDone', kidId: 'mia', star: true, character: false, marks: []}, {name: 'gallery', kidId: 'mia'}, {name: 'meet', kidId: 'mia', characterId: 'c'}].map(sc => screenTimeKid(sc as State['screen']))).toEqual(['mia', 'mia', 'mia', 'mia']);
    expect([{name: 'who'}, {name: 'board', kidId: 'mia'}, {name: 'claimed', kidId: 'mia', jobId: 'toys'}, {name: 'grownups'}].map(sc => screenTimeKid(sc as State['screen']))).toEqual([undefined, undefined, undefined, undefined]);
    // Mia: 30 given, 10 earned. Three minutes of puzzles come out of the base; the report goes out in seconds.
    const paired: State = {...sample, link: {token: 't', deviceId: 'd', familyName: 'F'} as Link, leftSec: {mia: 2400}};
    const played = reducer(paired, {type: 'watched', kidId: 'mia', seconds: 180});
    expect([timeToday(played, 'mia'), played.balances.mia, played.used.mia, played.leftSec.mia]).toEqual([37, 10, {baseMin: 3, earnedMin: 0}, 2220]);
    expect(played.outbox).toEqual([{kind: 'usage', id: played.outbox[0].id, childId: 'mia', seconds: 180}]);
    // Once the base is gone, earned marbles go, and what was watched can't be earned again today.
    const long = reducer(paired, {type: 'watched', kidId: 'mia', seconds: 35 * 60});
    expect([timeToday(long, 'mia'), long.balances.mia, long.used.mia, jarRoom(long, 'mia')]).toEqual([5, 5, {baseMin: 30, earnedMin: 5}, 20]);
    // Never below an empty jar, and less than a second is nothing.
    expect(timeToday(reducer(paired, {type: 'watched', kidId: 'mia', seconds: 3600}), 'mia')).toBe(0);
    expect(reducer(paired, {type: 'watched', kidId: 'mia', seconds: 0.4})).toBe(paired);
  });

  it('every job gives TV time: a job once marked routine earns its marble like any other', () => {
    const teeth = {...SAMPLE_FAMILY.jobs.mia.find(j => j.id === 'teeth')!, routine: true};
    expect(rewardFor(sample, 'mia', teeth)).toEqual({reward: 'marbles', minutes: 10});
    const s = approve(sample, 'mia', 'teeth');
    expect([s.balances.mia, mia(s)[0].reward, mia(s)[0].minutesCredited]).toEqual([20, 'marbles', 10]);
  });

  it('a decision counts once, and claiming twice makes one claim', () => {
    const once = approve(sample, 'mia', 'toys');
    expect(reducer(once, {type: 'decide', claimId: mia(once)[0].id, yes: true}).balances.mia).toBe(once.balances.mia);
    const twice = reducer(reducer(sample, {type: 'claim', kidId: 'mia', jobId: 'toys'}), {type: 'claim', kidId: 'mia', jobId: 'toys'});
    expect(twice.claims).toHaveLength(1);
  });

  it('a kid without a ceiling gets it from health guidance (60 under 7, 90 from 7) and half of it as the base', () => {
    expect([defaultDailyMax(6), defaultDailyMax(7)]).toEqual([60, 90]);
    const kid = {id: 'k', name: 'K', avatar: 'bear', avatarBg: '#000', age: 8} as Parameters<typeof normalKid>[0];
    expect(normalKid(kid)).toMatchObject({dailyMaxMin: 90, dailyBaseMin: 50, characterTokens: 0}); // half, rounded up to whole marbles
    expect(normalKid({...kid, age: 5, dailyBaseMin: 25, dailyMaxMin: 60})).toMatchObject({dailyMaxMin: 60, dailyBaseMin: 30}); // whole marbles
    expect(normalKid({...kid, age: 5, dailyBaseMin: 90, dailyMaxMin: 60}).dailyBaseMin).toBe(60); // never above the ceiling
  });
});

describe('saving and loading (the jar survives a restart)', () => {
  const busy = () => {
    let s = approve(sample, 'mia', 'toys');
    s = reducer(s, {type: 'claim', kidId: 'leo', jobId: 'table'});
    s = reducer(s, {type: 'setLang', lang: 'et'});
    return reducer(s, {type: 'setCaps', caps: true});
  };

  it('brings back everything except the screen', () => {
    const before = busy();
    const after = restore(initialState, JSON.parse(JSON.stringify(toSaved(before))));
    expect(after).toEqual({...before, screen: {name: 'who'}});
  });

  it('ignores a broken or unknown save', () => {
    for (const junk of [null, 'oops', 42, {version: 99, lang: 'de'}, {}]) expect(restore(initialState, junk)).toEqual(initialState);
    const partly = restore(initialState, {version: 1, demo: true, lang: 'xx', caps: 'yes', balances: {mia: 50}});
    expect(partly.lang).toBe('en');
    expect(partly.caps).toBe(false);
    expect(partly.balances).toEqual({mia: 50});
  });

  it('keeps waiting claims, and a week of decided ones', () => {
    const s = busy();
    const later = toSaved(s, Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(later.claims.map(c => c.status)).toEqual(['waiting']);
    expect(toSaved(s).claims).toHaveLength(2);
  });

  it('loads a save from before the daily ceiling, when there were games, in today’s shape', () => {
    const old = JSON.parse(JSON.stringify({
      ...toSaved(sample),
      family: {kids: [{id: 'mia', name: 'Mia', avatar: 'bear', avatarBg: '#fff', age: 5, dailyBaseMin: 30}], jobs: {mia: []}, games: {mia: [{id: 'numbers'}]}},
      gameMarblesToday: {mia: 2},
      outbox: [{kind: 'game', id: 'g', childId: 'mia', topic: 'numbers', correct: 3, total: 3, at: 1}],
      celebrations: [{id: 'c', kidId: 'mia', marbles: 2, why: {kind: 'game', gameId: 'numbers'}}],
    }));
    const s = restore(initialState, old);
    expect(s.family).toEqual({kids: [expect.objectContaining({id: 'mia', dailyMaxMin: 60, dailyBaseMin: 30, characterTokens: 0})], jobs: {mia: []}});
    expect([s.outbox, s.celebrations, 'gameMarblesToday' in s]).toEqual([[], [], false]);
  });
});

describe('job icons (the AI picks one per job from this set)', () => {
  it('every icon is drawn, named once and has a hint for the AI', () => {
    const names = JOB_ICONS.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(40);
    for (const {name, hint} of JOB_ICONS) {
      expect(fs.existsSync(path.join(__dirname, '../../assets/icons', `${name}.png`))).toBe(true);
      expect(hint.length).toBeGreaterThan(3);
    }
  });
});

describe('read-aloud (kids who cannot read yet hear every line)', () => {
  it('every fixed phrase is recorded, in every language (a family\'s own words come from the narrator)', () => {
    for (const {id} of LANGS) for (const line of spokenLines(id)) expect([id, line, VOICES[id][line] !== undefined]).toEqual([id, line, true]);
    expect(spokenLines('en')).toEqual([
      "Who’s here?", 'A grown-up will check.', 'Yay!', 'Wow!', 'Thank you!', 'Your jar is full, so you earned a new character!',
      // What a job gives, and why a grown-up said "not yet".
      'One marble', 'Two marbles', 'Three marbles', 'A new character', 'and a new character', 'A thank-you',
      'There’s a bit left to do.', 'Let’s do it together.', 'I’ll look later. Ask again.',
      // Strict mode and puzzles.
      'Who’s watching?', 'Puzzles', 'Yes!', 'A star',
      '5 stars: a new character!',
      // Asking for a new character's words: typed on the TV or in the phone app.
      'Type it here, or ask a grown-up to type it in the phone app.',
    ]);
  });
  it('the line under the character question offers typing only, here or in the phone app, in every language', () => {
    expect(t('et', 'characterNewHint')).toBe('Kirjuta siia või palu täiskasvanul see telefonis kirja panna.');
    for (const {id} of LANGS) expect(t(id, 'characterNewHint')).not.toMatch(/micro|mikro|Mikro|[{}]/);
  });
  it('finds a line whatever its spacing', () => {
    expect(voiceKey('Great job,\nMia!')).toBe('Great job, Mia!');
  });
});

describe('a paired TV (the phone app and the backend are the source of truth)', () => {
  const now = Date.now();
  const isoToday = ((new Date(now).getDay() + 6) % 7) + 1;
  const link: Link = {token: 't', deviceId: 'd', familyName: '', pin: {salt: 'salt', hash: sha256Hex('salt:4321')}};
  const paired: State = {...initialState, link};
  const server: ServerState = {
    family: {id: 'f', name: 'Tamm', lang: 'et', caps: true, voice: false, pin: link.pin},
    children: [{id: 'k1', name: 'Mari-Liis', avatar: 'bunny', color: 'mint', age: 6, balanceSec: 25 * 60 + 30, dailyBaseMin: 30, dailyMaxMin: 60, characterTokens: 0}],
    chores: [
      {id: 'c1', title: 'Koristan toa', icon: 'toys', color: 'peach', minutes: 10, repeat: {kind: 'daily'}, childIds: ['k1']},
      {id: 'c2', title: 'Täna', icon: 'plant', color: 'sky', minutes: 5, repeat: {kind: 'weekdays', days: [isoToday]}, childIds: ['k1'], routine: true},
      {id: 'c3', title: 'Mitte täna', icon: 'car', color: 'sky', minutes: 20, repeat: {kind: 'weekdays', days: [(isoToday % 7) + 1]}, childIds: ['k1']},
    ],
    claims: [],
    today: localDay(now),
    serverTime: now,
  };
  const claimed = (s: State) => reducer(s, {type: 'claim', kidId: 'k1', jobId: 'c1'});

  it('queues claims and decisions for the backend, but only once paired', () => {
    expect(claimed(initialState).outbox).toEqual([]);
    const s = claimed(paired);
    expect(s.outbox).toEqual([{kind: 'claim', id: s.claims[0].id, childId: 'k1', choreId: 'c1', at: s.claims[0].at}]);
    expect(reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true}).outbox.map(o => o.kind)).toEqual(['claim', 'decide']);
    // A "not yet" goes out with its reason; a yes never carries one.
    expect(reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: false, reason: 'together'}).outbox[1]).toMatchObject({kind: 'decide', yes: false, reason: 'together'});
    expect('reason' in reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, reason: 'together'}).outbox[1]).toBe(false);
  });

  it('"Oops!" before the claim was sent just drops it; after, it asks the backend to take it back', () => {
    const s = claimed(paired);
    expect(reducer(s, {type: 'undoClaim', kidId: 'k1', jobId: 'c1'}).outbox).toEqual([]);
    const sent = reducer(s, {type: 'sent', id: s.claims[0].id});
    expect(reducer(sent, {type: 'undoClaim', kidId: 'k1', jobId: 'c1'}).outbox).toEqual([{kind: 'undo', id: `undo-${s.claims[0].id}`, claimId: s.claims[0].id}]);
  });

  it('a character said into the phone while the TV was asking for it: the TV moves on to the collection', () => {
    const withToken: ServerState = {...server, children: [{...server.children[0], characterTokens: 1}]};
    const asking = reducer(applyServer(paired, withToken, now), {type: 'go', screen: {name: 'characterNew', kidId: 'k1'}});
    expect(applyServer(asking, withToken, now).screen).toEqual({name: 'characterNew', kidId: 'k1'}); // the token is still there: keep asking
    expect(applyServer(asking, server, now).screen).toEqual({name: 'gallery', kidId: 'k1'});
    // Opened with no token (a test link): a sync changes nothing.
    const noToken = reducer(applyServer(paired, server, now), {type: 'go', screen: {name: 'characterNew', kidId: 'k1'}});
    expect(applyServer(noToken, server, now).screen).toEqual({name: 'characterNew', kidId: 'k1'});
  });

  it('takes in the family, the jar’s ceiling, jobs, time and settings from the backend', () => {
    const s = applyServer(paired, server, now);
    expect(s.family.kids).toEqual([{id: 'k1', name: 'Mari-Liis', avatar: 'bunny', avatarBg: expect.any(String), age: 6, dailyBaseMin: 30, dailyMaxMin: 60, characterTokens: 0}]);
    expect(s.family.jobs.k1.map(j => [j.id, j.minutes, j.routine])).toEqual([['c1', 10, false], ['c2', 10, true]]); // not due today: gone; 5 → one marble
    expect(s.balances).toEqual({k1: 25});
    expect([s.lang, s.caps, s.voice, s.link?.familyName]).toEqual(['et', true, false, 'Tamm']);
  });

  it('a backend from before the daily ceiling gets the defaults from health guidance', () => {
    const {dailyBaseMin: _b, dailyMaxMin: _m, characterTokens: _c, ...older} = server.children[0];
    const s = applyServer(paired, {...server, children: [older]}, now);
    expect(s.family.kids[0]).toMatchObject({dailyMaxMin: 60, dailyBaseMin: 30, characterTokens: 0});
    expect(timeToday(s, 'k1')).toBe(30 + 25);
  });

  it('keeps what the backend has not seen yet, and celebrates jobs approved on the phone with what they gave and who said yes', () => {
    let s = applyServer(claimed(paired), server, now); // the claim is still in the outbox
    expect(s.claims).toHaveLength(1);
    const id = s.claims[0].id;
    s = reducer(s, {type: 'sent', id});
    const waiting = {id, childId: 'k1', choreId: 'c1', status: 'waiting' as const, minutes: 10, createdAt: now};
    const approved = {...waiting, status: 'approved' as const, decidedBy: 'parent' as const, approverName: 'Isa', reward: 'marbles' as const, minutesCredited: 10};
    s = applyServer(applyServer(s, {...server, claims: [waiting]}, now), {...server, claims: [approved]}, now);
    expect(s.celebrations).toEqual([{id, kidId: 'k1', marbles: 1, why: {kind: 'job', jobId: 'c1', reward: 'marbles', approver: 'Isa'}}]);
    expect(s.claims[0]).toMatchObject({reward: 'marbles', minutesCredited: 10, approverName: 'Isa'});
    // A full jar's job earns a character; an older backend's approval counts as plain marbles.
    const character = applyServer(applyServer(paired, {...server, claims: [waiting]}, now), {...server, claims: [{...approved, reward: 'character', minutesCredited: 0}]}, now);
    expect(character.celebrations[0]).toMatchObject({marbles: 0, why: {reward: 'character'}});
    const {reward: _r, minutesCredited: _mc, approverName: _a, ...plain} = approved;
    const older = applyServer(applyServer(paired, {...server, claims: [waiting]}, now), {...server, claims: [plain]}, now);
    expect(older.celebrations[0]).toMatchObject({marbles: 1, why: {reward: 'marbles'}});
    // A TV paired after the approval doesn't replay old news.
    expect(applyServer(paired, {...server, claims: [approved]}, now).celebrations).toEqual([]);
  });

  it('settings changed on a paired TV go to the backend as one change, and a sync never undoes them before that', () => {
    expect(reducer(initialState, {type: 'setLang', lang: 'de'}).outbox).toEqual([]);
    let s = reducer(reducer(paired, {type: 'setLang', lang: 'de'}), {type: 'setCaps', caps: true});
    expect(s.outbox).toEqual([{kind: 'settings', id: 'settings', lang: 'de', caps: true}]);
    expect([applyServer(s, server, now).lang, applyServer(s, server, now).caps]).toEqual(['de', true]); // server still says et, false
    s = reducer(s, {type: 'sent', id: 'settings'});
    expect(applyServer(s, server, now).lang).toBe('et'); // sent: the backend's word counts again
  });

  it('shows a "Yay!" where the kid can see it, not on someone else’s board or the grown-ups’ screen', () => {
    const c = {id: 'x', kidId: 'k1', marbles: 2, why: {kind: 'job' as const, jobId: 'c1', reward: 'marbles' as const}};
    const at = (screen: State['screen']) => celebrationToShow({...paired, celebrations: [c], screen});
    expect(at({name: 'who'})).toBe(c);
    expect(at({name: 'board', kidId: 'k1'})).toBe(c);
    expect(at({name: 'claimed', kidId: 'k1', jobId: 'c1'})).toBe(c);
    expect(at({name: 'board', kidId: 'k2'})).toBeUndefined();
    expect(at({name: 'grownups'})).toBeUndefined();
  });

  it('explains a "not yet" on the kid’s board until they try the job again', () => {
    let s = reducer(paired, {type: 'claim', kidId: 'k1', jobId: 'c1'});
    s = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: false});
    expect(notYetToday(s, 'k1').map(c => c.jobId)).toEqual(['c1']);
    expect(notYetToday(s, 'k1', Date.now() + 86400000)).toEqual([]); // tomorrow
    const again = reducer({...s, claims: s.claims.map(c => ({...c, at: c.at - 1}))}, {type: 'claim', kidId: 'k1', jobId: 'c1'});
    expect(notYetToday(again, 'k1')).toEqual([]);
  });

  it('celebrates a bonus from the phone once, and explains minutes taken away today', () => {
    const bonus = {id: 'b1', childId: 'k1', deltaMin: 20, reason: 'Helped grandma', at: now};
    const taken = {id: 'p1', childId: 'k1', deltaMin: -10, reason: 'Left the toys out', at: now};
    let s = applyServer(paired, server, now); // the first sync after pairing
    expect(applyServer(paired, {...server, adjustments: [bonus]}, now).celebrations).toEqual([]); // old news isn't replayed
    s = applyServer(s, {...server, adjustments: [taken, bonus]}, now);
    expect(s.celebrations).toEqual([{id: 'b1', kidId: 'k1', marbles: 2, why: {kind: 'bonus', reason: 'Helped grandma'}}]);
    expect(applyServer(s, {...server, adjustments: [taken, bonus]}, now).celebrations).toHaveLength(1); // not twice
    expect(takenToday(s, 'k1', now)).toEqual([taken]);
    expect(takenToday(s, 'k1', now + 86400000)).toEqual([]);
  });

  it('drops celebrations saved in an old shape instead of showing them wrong', () => {
    const old = {...toSaved(paired), celebrations: [{kidId: 'k1', marbles: 2, jobId: 'c1'}, {id: 'y', kidId: 'k1', marbles: 2, why: {kind: 'job', jobId: 'c1'}}]};
    expect(restore(initialState, old).celebrations).toEqual([]);
  });

  it('a job approved today is off the board until tomorrow; a one-off job for good', () => {
    const job = {id: 'c1', title: 'x', icon: 'toys' as const, color: '#fff', minutes: 10};
    const withClaim = (at: number) => ({...paired, claims: [{id: 'a', kidId: 'k1', jobId: 'c1', status: 'approved' as const, at}]});
    expect(isDone(withClaim(now), 'k1', job, now)).toBe(true);
    expect(isDone(withClaim(now - 86400000), 'k1', job, now)).toBe(false);
    expect(isDone(withClaim(now - 86400000), 'k1', {...job, once: true}, now)).toBe(true);
  });

  it('the grown-ups PIN: the family’s own once paired; 1234 only with a test link’s sample family', () => {
    expect(checkPin(paired, '1234')).toBe(false);
    expect(checkPin(paired, '4321')).toBe(true);
    expect(checkPin(sample, '1234')).toBe(true);
    expect(checkPin(initialState, '1234')).toBe(false); // a fresh TV has no grown-ups area to open
  });

  it('a fresh TV shows the welcome screen until a phone pairs it and the family arrives', () => {
    expect([initialState.family.kids, initialState.balances, needsPairing(initialState)]).toEqual([[], {}, true]);
    expect(needsPairing(sample)).toBe(false); // test links work unpaired
    const linked = reducer({...initialState, lang: 'et'}, {type: 'linked', link});
    expect([needsPairing(linked), firstSyncPending(linked), linked.lang]).toEqual([false, true, 'et']);
    expect(firstSyncPending(applyServer(linked, server, now))).toBe(false);
    expect(reducer(linked, {type: 'linked', link}).demo).toBe(false);
  });

  it('disconnecting forgets the family but keeps the TV’s settings', () => {
    const s = reducer(reducer(applyServer(claimed(paired), server, now), {type: 'setVoice', voice: true}), {type: 'unlink'});
    expect(s).toEqual({...initialState, lang: 'et', caps: true, voice: true});
    expect(needsPairing(s)).toBe(true);
  });

  it('an unpaired save from before the welcome screen (the old sample family) loads as a fresh TV', () => {
    const old = {...toSaved(sample), demo: undefined, lang: 'de'};
    expect(restore(initialState, JSON.parse(JSON.stringify(old)))).toEqual({...initialState, lang: 'de'});
    expect(restore(initialState, JSON.parse(JSON.stringify(toSaved(sample))))).toEqual({...sample, screen: {name: 'who'}}); // a test link's family stays
  });

  it('never shows a screen for a kid who isn’t in the family', () => {
    const s = applyServer(paired, server, now);
    expect(reducer(s, {type: 'go', screen: {name: 'board', kidId: 'mia'}}).screen).toEqual({name: 'who'});
    const onBoard = reducer(s, {type: 'go', screen: {name: 'board', kidId: 'k1'}});
    expect(onBoard.screen).toEqual({name: 'board', kidId: 'k1'});
    expect(applyServer(onBoard, {...server, children: [], chores: []}, now).screen).toEqual({name: 'who'}); // removed on the phone
  });

  it('saves the pairing and the outbox', () => {
    const s = claimed(paired);
    expect(restore(initialState, JSON.parse(JSON.stringify(toSaved(s))))).toEqual({...s, screen: {name: 'who'}});
  });

  it('hashes like the backend (SHA-256, UTF-8)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('Mari-Liis õun 🍎')).toBe('fcf2f9a2b9853bf81c6803b655ab47c3ed822eafec1cf3196028f13a273b9ff0');
    expect(sha256Hex('a'.repeat(200))).toBe('c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5');
  });
});

describe('translations', () => {
  it('every language has every text, with the same {holes} as English', () => {
    const holes = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const {id} of LANGS) {
      for (const [key, value] of Object.entries(STRINGS.en)) {
        const other = (STRINGS[id] as Record<string, string>)[key];
        expect(other && other.length > 0).toBe(true);
        expect(holes(other)).toBe(holes(value));
      }
    }
  });
});

describe('text fitting for user content', () => {
  it('keeps short text at full size', () => {
    expect(fitFontSize('Mia', 400, 84, 40, 1)).toBe(84);
  });
  it('shrinks a long name to fit one line', () => {
    const size = fitFontSize('Maximilian-Alexander', 400, 84, 30, 1);
    expect(size).toBeLessThan(84);
    expect(linesNeeded('Maximilian-Alexander', 400, size)).toBe(1);
  });
  it('fits a long German job title on a card (3 lines) without cutting it off', () => {
    const text = 'Geschirrspülmaschine ausräumen und Küche wischen';
    const size = fitFontSize(text, 280, 42, 20, 3);
    expect(linesNeeded(text, 280, size)).toBeLessThanOrEqual(3);
    expect(size).toBeGreaterThan(20);
  });
  it('never goes below the minimum, even for one huge word', () => {
    expect(fitFontSize('Supercalifragilisticexpialidocious', 100, 42, 24, 2)).toBe(24);
  });
  it('respects explicit line breaks', () => {
    expect(linesNeeded('Great job,\nMia!', 2000, 150)).toBe(2);
  });
  it('keeps a 3-line card title inside the card’s height (it once slid under the marbles)', () => {
    const size = fitFontSize('KORISTA LEGOD PÕRANDALT', 280, 42, 22, 3, CAPS_WIDTH, 124);
    expect(linesNeeded('KORISTA LEGOD PÕRANDALT', 280, size, CAPS_WIDTH) * Math.round(size * 1.15)).toBeLessThanOrEqual(124);
    expect(fitFontSize('KASS', 280, 42, 22, 3, CAPS_WIDTH, 124)).toBe(42); // short titles stay big
  });
  it('sizes marbles to the jar, so a full jar of any size is full to the top', () => {
    const {JAR, JAR_CAPACITY, pileTop, radiusFor} = require('../physics');
    for (let n = 2; n <= JAR_CAPACITY; n++) {
      const top = pileTop(n, radiusFor(n));
      expect([n, top >= JAR.height * 0.08 - 0.5, top <= JAR.height * 0.15]).toEqual([n, true, true]);
    }
    expect(radiusFor(6)).toBeGreaterThan(radiusFor(12)); // a 60-minute jar has bigger marbles than a 120-minute one
  });

  it('wraps a double name after its hyphen instead of mid-word', () => {
    // 360 px at 46 px capitals holds 11 letters: "MAXIMILIAN-" / "ALEXANDER".
    expect(linesNeeded('MAXIMILIAN-ALEXANDER', 360, 46, CAPS_WIDTH)).toBe(2);
    expect(fitFontSize('MAXIMILIAN-ALEXANDER', 360, 84, 36, 2, CAPS_WIDTH)).toBeGreaterThan(36);
    expect(linesNeeded('Mari-Liis Tamm', 2000, 40)).toBe(1);
  });
});

describe('marble physics', () => {
  const {JAR, JAR_CAPACITY, jarDrops} = require('../physics');
  const drops = jarDrops(JAR_CAPACITY);

  it('every marble settles inside the glass', () => {
    for (const d of drops) {
      expect(d.final.x).toBeGreaterThanOrEqual(JAR.radius - 0.5);
      expect(d.final.x).toBeLessThanOrEqual(JAR.width - JAR.radius + 0.5);
      expect(d.final.y).toBeLessThanOrEqual(JAR.height - JAR.radius + 0.5);
    }
  });

  it('marbles do not overlap once settled', () => {
    for (let i = 0; i < drops.length; i++) {
      for (let j = 0; j < i; j++) {
        const dist = Math.hypot(drops[i].final.x - drops[j].final.x, drops[i].final.y - drops[j].final.y);
        expect(dist).toBeGreaterThan(2 * JAR.radius - 2);
      }
    }
  });

  it('a drop clinks at least once and takes about a second', () => {
    expect(drops[0].impacts.length).toBeGreaterThan(0);
    expect(drops[0].duration).toBeGreaterThan(0.4);
    expect(drops[0].duration).toBeLessThan(4.1);
  });

  it('is deterministic: the same jar on every device', () => {
    const again = jarDrops(5);
    expect(again.map((d: {final: {x: number}}) => Math.round(d.final.x))).toEqual(drops.slice(0, 5).map((d: {final: {x: number}}) => Math.round(d.final.x)));
  });

  it('a full jar still fits under the lid', () => {
    const top = Math.min(...drops.map((d: {final: {y: number}}) => d.final.y));
    expect(top).toBeGreaterThan(-JAR.radius);
  });
});
