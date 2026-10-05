import {describe, expect, it} from 'vitest';
import {family} from './helpers';

/** [what, path, body, field named in the message] — each must be a 400 with code "invalid". */
const ID = '00000000-0000-4000-8000-000000000000';
const cases: [string, string, (ids: {mia: string; claim: string}) => unknown, string][] = [
  ['family name too long', '/family', () => ({name: 'x'.repeat(41), lang: 'en', timezone: 'UTC', pin: '1234'}), 'name'],
  ['unknown language', '/family', () => ({name: 'F', lang: 'fr', timezone: 'UTC', pin: '1234'}), 'lang'],
  ['not a time zone', '/family', () => ({name: 'F', lang: 'en', timezone: 'Mars/Base', pin: '1234'}), 'timezone'],
  ['PIN not 4 digits', '/family', () => ({name: 'F', lang: 'en', timezone: 'UTC', pin: '12345'}), 'pin'],
  ['child name over 24 characters', '/children', () => ({name: 'x'.repeat(25), avatar: 'bear', color: 'mint', age: 5}), 'name'],
  ['child name only spaces', '/children', () => ({name: '   ', avatar: 'bear', color: 'mint', age: 5}), 'name'],
  ['child too young', '/children', () => ({name: 'A', avatar: 'bear', color: 'mint', age: 2}), 'age'],
  ['age not whole', '/children', () => ({name: 'A', avatar: 'bear', color: 'mint', age: 5.5}), 'age'],
  ['unknown avatar', '/children', () => ({name: 'A', avatar: 'cat', color: 'mint', age: 5}), 'avatar'],
  ['unknown colour', '/children', () => ({name: 'A', avatar: 'bear', color: 'red', age: 5}), 'color'],
  ['topic twice', '/children', () => ({name: 'A', avatar: 'bear', color: 'mint', age: 5, games: {topics: ['words', 'words']}}), 'games.topics'],
  ['game cap over 12', '/children', () => ({name: 'A', avatar: 'bear', color: 'mint', age: 5, games: {topics: [], dailyCapMarbles: 13}}), 'games.dailyCapMarbles'],
  ['missing field', '/children', () => ({avatar: 'bear', color: 'mint', age: 5}), 'name'],
  ['job title over 60 characters', '/chores', ({mia}) => ({title: 'x'.repeat(61), minutes: 10, childIds: [mia]}), 'title'],
  ['minutes not in 5s', '/chores', ({mia}) => ({title: 'Job', minutes: 7, childIds: [mia]}), 'minutes'],
  ['minutes over 120', '/chores', ({mia}) => ({title: 'Job', minutes: 125, childIds: [mia]}), 'minutes'],
  ['no kids', '/chores', () => ({title: 'Job', minutes: 10, childIds: []}), 'childIds'],
  ['unknown icon', '/chores', ({mia}) => ({title: 'Job', icon: 'unicorn', minutes: 10, childIds: [mia]}), 'icon'],
  ['weekday 8', '/chores', ({mia}) => ({title: 'Job', minutes: 10, childIds: [mia], repeat: {kind: 'weekdays', days: [8]}}), 'repeat.days[0]'],
  ['weekdays without days', '/chores', ({mia}) => ({title: 'Job', minutes: 10, childIds: [mia], repeat: {kind: 'weekdays'}}), 'repeat.days'],
  ['unknown repeat', '/chores', ({mia}) => ({title: 'Job', minutes: 10, childIds: [mia], repeat: {kind: 'monthly'}}), 'repeat.kind'],
  ['zero minutes adjust', '/children/{mia}/adjust', () => ({deltaMin: 0, reason: 'x'}), 'deltaMin'],
  ['adjust not in 5s', '/children/{mia}/adjust', () => ({deltaMin: 3, reason: 'x'}), 'deltaMin'],
  ['adjust over 120', '/children/{mia}/adjust', () => ({deltaMin: -125, reason: 'x'}), 'deltaMin'],
  ['reason over 80 characters', '/children/{mia}/adjust', () => ({deltaMin: 5, reason: 'x'.repeat(81)}), 'reason'],
  ['hand-off status', '/children/{mia}/handoff', () => ({entryIds: [ID], status: 'PENDING'}), 'status'],
  ['hand-off without ids', '/children/{mia}/handoff', () => ({entryIds: [], status: 'DONE'}), 'entryIds'],
  ['TV name empty', '/pairings/ABCDEF/confirm', () => ({name: ''}), 'name'],
  ['unknown mode', '/pairings/ABCDEF/confirm', () => ({name: 'TV', mode: 'kiosk'}), 'mode'],
  ['unknown platform', '/pairings', () => ({platform: 'roku'}), 'platform'],
  ['claim time not a number', '/device/claims', ({mia}) => ({id: ID, childId: mia, choreId: ID, at: 'now'}), 'at'],
  ['claim id with odd characters', '/device/claims', ({mia}) => ({id: 'a#b', childId: mia, choreId: ID, at: 1}), 'id'],
  ['PIN letters', '/device/claims/{claim}/decide', () => ({yes: true, pin: 'abcd'}), 'pin'],
  ['yes not a boolean', '/device/claims/{claim}/decide', () => ({yes: 'yes', pin: '1234'}), 'yes'],
  ['game total over 10', '/device/games/results', ({mia}) => ({id: ID, childId: mia, topic: 'numbers', correct: 3, total: 11, at: 1}), 'total'],
  ['unknown topic', '/device/games/results', ({mia}) => ({id: ID, childId: mia, topic: 'art', correct: 3, total: 3, at: 1}), 'topic'],
];

describe('validation', () => {
  it.each(cases)('rejects %s with 400', async (_, path, body, field) => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const url = path.replace('{mia}', f.mia.id).replace('{claim}', claim.id);
    // TV routes as the TV, onboarding as a new parent, the rest as the family's parent.
    const caller = url.startsWith('/device/') || url === '/pairings' ? f.tv : url === '/family' ? f.parent('newcomer') : f.mom;
    const res = await caller.post(url, body({mia: f.mia.id, claim: claim.id}));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({error: {code: 'invalid', message: expect.stringMatching(new RegExp(`^${field.replace(/[.[\]]/g, '\\$&')} `))}});
  });

  it('counts characters, not bytes: 24 letters with accents fit', async () => {
    const f = await family();
    expect((await f.mom.post('/children', {name: 'Õ'.repeat(24), avatar: 'bear', color: 'mint', age: 5})).status).toBe(201);
  });

  it('checks query parameters', async () => {
    const f = await family();
    for (const limit of ['0', '201', 'abc', '1.5']) {
      expect((await f.mom.get(`/children/${f.mia.id}/ledger?limit=${limit}`)).status).toBe(400);
    }
    expect((await f.mom.get(`/children/${f.mia.id}/ledger?limit=200`)).status).toBe(200);
    expect((await f.mom.get('/claims?status=pending')).body.error.message).toMatch(/^status /);
  });
});
