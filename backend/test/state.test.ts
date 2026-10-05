import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {DAY, family, MONDAY_NOON} from './helpers';

describe('GET /device/state', () => {
  it('has everything the TV needs', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const res = await f.tv.get('/device/state');
    expect(res.status).toBe(200);
    const state = res.body;
    expect(Object.keys(state)).toEqual(['family', 'children', 'chores', 'claims', 'gameMarblesToday', 'today', 'serverTime']);
    expect(state.family).toEqual({id: expect.any(String), name: 'Test family', lang: 'en', caps: false, voice: true, pin: {salt: expect.any(String), hash: expect.any(String)}});
    // The TV checks the PIN offline: hex(sha256(salt + ":" + pin)).
    expect(createHash('sha256').update(`${state.family.pin.salt}:1234`).digest('hex')).toBe(state.family.pin.hash);
    expect(state.children).toEqual([f.mia, f.leo]);
    expect(state.chores).toEqual([f.toys, f.teeth]);
    expect(state.claims).toEqual([claim]);
    expect(state.gameMarblesToday).toEqual({[f.mia.id]: 0, [f.leo.id]: 0});
    expect(state.today).toBe('2026-10-05');
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

  it('shows new balances right after an approval', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    const {body: state} = await f.tv.get('/device/state');
    expect(state.children[0].balanceSec).toBe(600);
    expect(state.claims[0]).toMatchObject({id: claim.id, status: 'approved'});
  });
});
