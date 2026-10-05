import * as fs from 'fs';
import * as path from 'path';
import {bank, DAILY_GAME_MARBLES, isQuestionValid, JOB_ICONS, Question, questionsFor} from '../data';
import {LANGS, STRINGS} from '../i18n';
import {CAPS_WIDTH, fitFontSize, linesNeeded} from '../fit';
import type {ServerState} from '../api';
import {applyServer, checkPin, initialState, isDone, Link, localDay, marblesIn, reducer, restore, State, toSaved} from '../logic';
import {sha256Hex} from '../sha256';
import {spokenLines, voiceKey} from '../voiceLines';
import {VOICES} from '../voices';

describe('question checker (the app checks every question, including AI-made ones)', () => {
  it('accepts every question in the built-in bank, in every language', () => {
    for (const {id} of LANGS) for (const topic of Object.values(bank(id))) {
      for (const band of Object.values(topic)) {
        for (const q of band) expect(isQuestionValid(q)).toBe(true);
      }
    }
  });

  it('rejects a counting question whose answer does not match the picture', () => {
    const q: Question = {
      prompt: 'How many apples?', say: '', praise: '',
      picture: {kind: 'count', item: 'apple', n: 4},
      choices: [{kind: 'text', text: '3'}, {kind: 'text', text: '4'}, {kind: 'text', text: '5'}],
      answer: 0,
    };
    expect(isQuestionValid(q)).toBe(false);
  });

  it('rejects a pattern question with the wrong next shape', () => {
    const q: Question = {
      prompt: 'What comes next?', say: '', praise: '',
      picture: {kind: 'sequence', shapes: ['circle', 'triangle', 'circle', 'triangle', 'circle']},
      choices: [{kind: 'shape', shape: 'square'}, {kind: 'shape', shape: 'triangle'}, {kind: 'shape', shape: 'circle'}],
      answer: 2,
    };
    expect(isQuestionValid(q)).toBe(false);
  });

  it('rejects duplicate choices and wrong sums', () => {
    const dup: Question = {
      prompt: '', say: '', praise: '',
      picture: {kind: 'sentence', before: '7 + 5 =', after: ''},
      choices: [{kind: 'text', text: '12'}, {kind: 'text', text: '12'}, {kind: 'text', text: '13'}],
      answer: 0,
    };
    expect(isQuestionValid(dup)).toBe(false);
    const wrongSum = {...dup, choices: [{kind: 'text', text: '11'}, {kind: 'text', text: '12'}, {kind: 'text', text: '13'}], answer: 0} as Question;
    expect(isQuestionValid(wrongSum)).toBe(false);
  });

  it('gives young kids picture questions and older kids text questions', () => {
    expect(questionsFor('numbers', 5)[0].picture.kind).toBe('count');
    expect(questionsFor('numbers', 8)[0].picture.kind).toBe('sentence');
    expect(questionsFor('words', 5).length).toBe(3); // no young word bank yet: falls back to the older one
  });
});

describe('jar and approvals', () => {
  const claimed = (s: State) => reducer(s, {type: 'claim', kidId: 'mia', jobId: 'toys'});

  it('a claim waits for a grown-up and does not add time on its own', () => {
    const s = claimed(initialState);
    expect(s.claims).toHaveLength(1);
    expect(s.claims[0].status).toBe('waiting');
    expect(s.balances.mia).toBe(initialState.balances.mia);
  });

  it('"Yes" adds the minutes and queues a celebration; "Not yet" adds nothing', () => {
    const s = claimed(initialState);
    const yes = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    expect(yes.balances.mia).toBe(initialState.balances.mia + 10);
    expect(yes.celebrations).toEqual([{kidId: 'mia', marbles: 2, jobId: 'toys'}]);
    const no = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: false, minutes: 0});
    expect(no.balances.mia).toBe(initialState.balances.mia);
    expect(no.celebrations).toHaveLength(0);
  });

  it('a decision only counts once', () => {
    const s = claimed(initialState);
    const once = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    const twice = reducer(once, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    expect(twice.balances.mia).toBe(once.balances.mia);
  });

  it('claiming the same job twice does not make two claims', () => {
    expect(claimed(claimed(initialState)).claims).toHaveLength(1);
  });

  it('games pay marbles straight away, up to the daily cap', () => {
    let s = initialState;
    for (let i = 0; i < 3; i++) s = reducer(s, {type: 'gameDone', kidId: 'mia', marbles: 2, gameId: 'numbers'});
    expect(s.gameMarblesToday.mia).toBe(DAILY_GAME_MARBLES);
    expect(s.balances.mia).toBe(initialState.balances.mia + DAILY_GAME_MARBLES * 5);
  });

  it('one marble is five minutes', () => {
    expect(marblesIn(35)).toBe(7);
    expect(marblesIn(39)).toBe(7);
  });
});

describe('saving and loading (the jar survives a restart)', () => {
  const busy = () => {
    let s = reducer(initialState, {type: 'claim', kidId: 'mia', jobId: 'toys'});
    s = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
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
    const partly = restore(initialState, {version: 1, lang: 'xx', caps: 'yes', balances: {mia: 50}});
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

  it('the daily game cap starts again on a new day', () => {
    const yesterday = {...initialState, gameDay: '2000-01-01', gameMarblesToday: {mia: DAILY_GAME_MARBLES}};
    const s = reducer(yesterday, {type: 'gameDone', kidId: 'mia', marbles: 2, gameId: 'numbers'});
    expect(s.gameMarblesToday).toEqual({mia: 2});
    expect(s.gameDay).toBe(localDay(Date.now()));
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
  it('every line the sample family hears is recorded, in every language', () => {
    for (const {id} of LANGS) for (const line of spokenLines(id)) expect([id, line, VOICES[id][line] !== undefined]).toEqual([id, line, true]);
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
    children: [{id: 'k1', name: 'Mari-Liis', avatar: 'bunny', color: 'mint', age: 6, balanceSec: 25 * 60 + 30, games: {topics: ['numbers'], dailyCapMarbles: 4}}],
    chores: [
      {id: 'c1', title: 'Koristan toa', icon: 'toys', color: 'peach', minutes: 10, repeat: {kind: 'daily'}, childIds: ['k1']},
      {id: 'c2', title: 'Täna', icon: 'plant', color: 'sky', minutes: 5, repeat: {kind: 'weekdays', days: [isoToday]}, childIds: ['k1']},
      {id: 'c3', title: 'Mitte täna', icon: 'car', color: 'sky', minutes: 5, repeat: {kind: 'weekdays', days: [(isoToday % 7) + 1]}, childIds: ['k1']},
    ],
    claims: [],
    gameMarblesToday: {k1: 2},
    today: localDay(now),
    serverTime: now,
  };
  const claimed = (s: State) => reducer(s, {type: 'claim', kidId: 'k1', jobId: 'c1'});

  it('queues claims, decisions and game results for the backend, but only once paired', () => {
    expect(claimed(initialState).outbox).toEqual([]);
    const s = claimed(paired);
    expect(s.outbox).toEqual([{kind: 'claim', id: s.claims[0].id, childId: 'k1', choreId: 'c1', at: s.claims[0].at}]);
    expect(reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10}).outbox.map(o => o.kind)).toEqual(['claim', 'decide']);
    expect(reducer(paired, {type: 'gameDone', kidId: 'k1', marbles: 2, gameId: 'numbers', total: 3}).outbox).toMatchObject([{kind: 'game', childId: 'k1', topic: 'numbers', correct: 3, total: 3}]);
  });

  it('"Oops!" before the claim was sent just drops it; after, it asks the backend to take it back', () => {
    const s = claimed(paired);
    expect(reducer(s, {type: 'undoClaim', kidId: 'k1', jobId: 'c1'}).outbox).toEqual([]);
    const sent = reducer(s, {type: 'sent', id: s.claims[0].id});
    expect(reducer(sent, {type: 'undoClaim', kidId: 'k1', jobId: 'c1'}).outbox).toEqual([{kind: 'undo', id: `undo-${s.claims[0].id}`, claimId: s.claims[0].id}]);
  });

  it('takes in the family, time and settings from the backend', () => {
    const s = applyServer(paired, server, now);
    expect(s.family.kids).toEqual([{id: 'k1', name: 'Mari-Liis', avatar: 'bunny', avatarBg: expect.any(String), age: 6}]);
    expect(s.family.jobs.k1.map(j => j.id)).toEqual(['c1', 'c2']);
    expect(s.family.games.k1.map(g => g.topic)).toEqual(['numbers']);
    expect(s.balances).toEqual({k1: 25});
    expect([s.lang, s.caps, s.voice, s.link?.familyName, s.gameMarblesToday.k1]).toEqual(['et', true, false, 'Tamm', 2]);
  });

  it('keeps what the backend has not seen yet, and celebrates jobs approved on the phone', () => {
    let s = applyServer(claimed(paired), server, now); // the claim is still in the outbox
    expect(s.claims).toHaveLength(1);
    const id = s.claims[0].id;
    s = reducer(s, {type: 'sent', id});
    const approved = {...server, claims: [{id, childId: 'k1', choreId: 'c1', status: 'approved' as const, minutes: 10, createdAt: now, decidedBy: 'parent' as const}]};
    s = applyServer(applyServer(s, {...approved, claims: [{...approved.claims[0], status: 'waiting'}]}, now), approved, now);
    expect(s.celebrations).toEqual([{kidId: 'k1', marbles: 2, jobId: 'c1'}]);
    // A TV paired after the approval doesn't replay old news.
    expect(applyServer(paired, approved, now).celebrations).toEqual([]);
  });

  it('a job approved today is off the board until tomorrow; a one-off job for good', () => {
    const job = {id: 'c1', title: 'x', icon: 'toys' as const, color: '#fff', minutes: 10};
    const withClaim = (at: number) => ({...paired, claims: [{id: 'a', kidId: 'k1', jobId: 'c1', status: 'approved' as const, at}]});
    expect(isDone(withClaim(now), 'k1', job, now)).toBe(true);
    expect(isDone(withClaim(now - 86400000), 'k1', job, now)).toBe(false);
    expect(isDone(withClaim(now - 86400000), 'k1', {...job, once: true}, now)).toBe(true);
  });

  it('the grown-ups PIN: 1234 before pairing, the family’s own after', () => {
    expect(checkPin(initialState, '1234')).toBe(true);
    expect(checkPin(paired, '1234')).toBe(false);
    expect(checkPin(paired, '4321')).toBe(true);
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
