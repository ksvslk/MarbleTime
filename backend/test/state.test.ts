import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {DAY, family, MONDAY_NOON, pairTv, textReply} from './helpers';

describe('GET /device/state', () => {
  it('has everything the TV needs', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const res = await f.tv.get('/device/state');
    expect(res.status).toBe(200);
    const state = res.body;
    expect(Object.keys(state)).toEqual(['family', 'device', 'children', 'chores', 'adjustments', 'claims', 'characters', 'today', 'realtimeUrl', 'serverTime']);
    expect(state.family).toEqual({id: expect.any(String), name: 'Test family', lang: 'en', caps: false, voice: true, pin: {salt: expect.any(String), hash: expect.any(String)}});
    // The TV checks the PIN offline: hex(sha256(salt + ":" + pin)).
    expect(createHash('sha256').update(`${state.family.pin.salt}:1234`).digest('hex')).toBe(state.family.pin.hash);
    expect(state.device).toEqual({id: f.deviceId, name: 'Living room', mode: 'amazon_kids'});
    expect(state.children).toEqual([f.mia, f.leo]);
    expect(state.chores).toEqual([f.toys, f.teeth]);
    expect(state.adjustments).toEqual([]);
    expect(state.claims).toEqual([claim]);
    expect(state.characters).toEqual([]);
    expect(state.today).toBe('2026-10-05');
    expect(state.realtimeUrl).toBe('wss://realtime.test/dev'); // where the TV connects for live updates
    expect(state.serverTime).toBe(MONDAY_NOON);
  });

  it("says today in the family's time zone", async () => {
    const f = await family(Date.UTC(2026, 9, 5, 22, 30)); // 01:30 on Tuesday in Tallinn
    expect((await f.tv.get('/device/state')).body.today).toBe('2026-10-06');
  });

  it('answers 304 to If-None-Match while nothing changed (serverTime aside)', async () => {
    const f = await family();
    const first = await f.tv.get('/device/state');
    const etag = first.headers.etag;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    f.clock.now += 3000;
    const same = await f.tv.get('/device/state', {'if-none-match': etag});
    expect(same.status).toBe(304);
    expect(same.body).toBeUndefined();
    expect(same.headers.etag).toBe(etag);
    expect((await f.tv.get('/device/state', {'if-none-match': `W/${etag}, "other"`})).status).toBe(304);

    await f.claim(f.mia.id, f.toys.id);
    const changed = await f.tv.get('/device/state', {'if-none-match': etag});
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
    expect(changed.body.claims).toHaveLength(1);
  });

  it('shows waiting claims of any age, and decided ones for 7 days', async () => {
    const f = await family();
    const {body: old} = await f.claim(f.mia.id, f.toys.id);
    f.clock.now += 1000;
    const {body: waiting} = await f.claim(f.leo.id, f.teeth.id);
    await f.mom.post(`/claims/${old.id}/approve`);
    f.clock.now += 7 * DAY;
    expect((await f.tv.get('/device/state')).body.claims.map((c: {id: string}) => c.id)).toEqual([waiting.id, old.id]);
    f.clock.now += 1;
    expect((await f.tv.get('/device/state')).body.claims.map((c: {id: string}) => c.id)).toEqual([waiting.id]);
  });

  it('tells each TV which TV it is, with its mode (and a new ETag when that changes)', async () => {
    const f = await family();
    const {tv: kitchen, deviceId: kitchenId} = await pairTv(f, f.mom, 'Kitchen');
    expect((await kitchen.get('/device/state')).body.device).toEqual({id: kitchenId, name: 'Kitchen', mode: 'amazon_kids'});
    const before = await f.tv.get('/device/state');
    await f.mom.patch(`/devices/${f.deviceId}`, {name: 'Den', mode: 'strict'});
    const after = await f.tv.get('/device/state', {'if-none-match': before.headers.etag});
    expect(after.status).toBe(200);
    expect(after.body.device).toEqual({id: f.deviceId, name: 'Den', mode: 'strict'});
  });

  it('lists bonuses and taken-away minutes of the last 7 days, newest first, as applied', async () => {
    const f = await family();
    const adjust = (deltaMin: number, reason: string) => f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin, reason});
    const {body: bonus} = await adjust(20, 'Helped grandma');
    f.clock.now += 1000;
    const before = await f.tv.get('/device/state');
    const {body: minus} = await adjust(-10, 'Hit her brother');
    f.clock.now += 1000;
    const {body: clamped} = await adjust(-20, 'Still hitting'); // only 10 minutes were left
    // Jobs change jars too, but they are not adjustments.
    const {body: claim} = await f.claim(f.leo.id, f.teeth.id);
    await f.mom.post(`/claims/${claim.id}/approve`);

    const after = await f.tv.get('/device/state', {'if-none-match': before.headers.etag});
    expect(after.status).toBe(200);
    expect(after.body.adjustments).toEqual([
      {id: clamped.entry.id, childId: f.mia.id, deltaMin: -10, reason: 'Still hitting', at: MONDAY_NOON + 2000},
      {id: minus.entry.id, childId: f.mia.id, deltaMin: -10, reason: 'Hit her brother', at: MONDAY_NOON + 1000},
      {id: bonus.entry.id, childId: f.mia.id, deltaMin: 20, reason: 'Helped grandma', at: MONDAY_NOON},
    ]);
    expect(after.body.children[0].balanceSec).toBe(0);

    f.clock.now = MONDAY_NOON + 7 * DAY;
    expect((await f.tv.get('/device/state')).body.adjustments).toHaveLength(3);
    f.clock.now += 1;
    expect((await f.tv.get('/device/state')).body.adjustments.map((a: {deltaMin: number}) => a.deltaMin)).toEqual([-10, -10]);
  });

  it('shows new balances right after an approval, with the reward and who approved', async () => {
    const f = await family();
    await f.mom.patch('/me', {name: 'Mom'});
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    const {body: state} = await f.tv.get('/device/state');
    expect(state.children[0]).toMatchObject({balanceSec: 600, dailyMaxMin: 60, dailyBaseMin: 30, characterTokens: 0});
    expect(state.claims[0]).toMatchObject({id: claim.id, status: 'approved', reward: 'marbles', minutesCredited: 10, approverName: 'Mom'});
  });

  it('lists the kids\' drawing and ready characters (not ones that need help), newest first, with a new ETag on each change', async () => {
    const f = await family();
    await f.giveTokens(f.mia.id, 2);
    await f.giveTokens(f.leo.id, 1);
    const {body: dragon} = await f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a dragon who loves pancakes'});
    f.clock.now += 1000;
    const {body: robot} = await f.mom.post(`/children/${f.leo.id}/characters`, {description: 'a tiny brave robot'});
    const drawing = await f.tv.get('/device/state');
    expect(drawing.body.characters).toEqual([
      {id: robot.id, childId: f.leo.id, status: 'drawing', name: robot.name, voice: robot.voice, mood: robot.card.mood, createdAt: MONDAY_NOON + 1000},
      {id: dragon.id, childId: f.mia.id, status: 'drawing', name: dragon.name, voice: dragon.voice, mood: dragon.card.mood, createdAt: MONDAY_NOON},
    ]);
    f.artist.text$.push(textReply('not an svg'), textReply('not an svg'), textReply('not an svg')); // the dragon fails three rounds
    await f.runDrawing();
    const after = await f.tv.get('/device/state', {'if-none-match': drawing.headers.etag});
    expect(after.status).toBe(200);
    expect(after.body.characters).toEqual([{id: robot.id, childId: f.leo.id, status: 'ready', name: robot.name, voice: robot.voice, mood: robot.card.mood, createdAt: MONDAY_NOON + 1000}]);
  });
});
