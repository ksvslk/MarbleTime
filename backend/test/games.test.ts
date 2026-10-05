import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {family, MINUTE} from './helpers';

describe('brain games', () => {
  const play = (f: Awaited<ReturnType<typeof family>>, childId: string, id: string = randomUUID()) =>
    f.tv.post('/device/games/results', {id, childId, topic: 'numbers', correct: 3, total: 3, at: f.clock.now});

  it('gives 2 marbles a game up to the daily cap (default 4), as a GAME ledger entry', async () => {
    const f = await family();
    const id = randomUUID();
    const first = await play(f, f.mia.id, id);
    expect(first.body).toEqual({marbles: 2, balanceSec: 600});
    f.clock.now += MINUTE;
    expect((await play(f, f.mia.id)).body).toEqual({marbles: 2, balanceSec: 1200});
    expect((await play(f, f.mia.id)).body).toEqual({marbles: 0, balanceSec: 1200});

    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[1]).toMatchObject({type: 'GAME', deltaSec: 600, reason: 'numbers', refId: id, createdBy: `tv:${f.deviceId}`, handoff: 'PENDING'});
    expect((await f.tv.get('/device/state')).body.gameMarblesToday).toEqual({[f.mia.id]: 4, [f.leo.id]: 0});
  });

  it('is idempotent on the result id: a resend gets the same marbles and changes nothing', async () => {
    const f = await family();
    const id = randomUUID();
    await play(f, f.mia.id, id);
    await play(f, f.mia.id);
    const resend = await play(f, f.mia.id, id);
    expect(resend.body).toEqual({marbles: 2, balanceSec: 1200});
    // A capped result is remembered too.
    const capped = randomUUID();
    expect((await play(f, f.mia.id, capped)).body.marbles).toBe(0);
    f.clock.now += 24 * 60 * MINUTE;
    expect((await play(f, f.mia.id, capped)).body.marbles).toBe(0);
  });

  it("starts a new day at the family's midnight", async () => {
    const f = await family(Date.UTC(2026, 9, 5, 20, 50)); // 23:50 in Tallinn
    await play(f, f.mia.id);
    await play(f, f.mia.id);
    expect((await play(f, f.mia.id)).body.marbles).toBe(0);
    f.clock.now = Date.UTC(2026, 9, 5, 21, 1); // 00:01 in Tallinn, still Monday in UTC
    expect((await play(f, f.mia.id)).body.marbles).toBe(2);
    expect((await f.tv.get('/device/state')).body.gameMarblesToday[f.mia.id]).toBe(2);
  });

  it("follows the kid's own cap", async () => {
    const f = await family();
    await f.mom.patch(`/children/${f.leo.id}`, {games: {topics: ['words'], dailyCapMarbles: 3}});
    expect((await play(f, f.leo.id)).body.marbles).toBe(2);
    expect((await play(f, f.leo.id)).body.marbles).toBe(1);
    expect((await play(f, f.leo.id)).body.marbles).toBe(0);
    await f.mom.patch(`/children/${f.leo.id}`, {games: {topics: [], dailyCapMarbles: 0}});
    expect((await play(f, f.mia.id)).body.marbles).toBe(2);
  });

  it('never passes the cap when results arrive at the same moment', async () => {
    const f = await family();
    await play(f, f.mia.id);
    const results = await Promise.all([play(f, f.mia.id), play(f, f.mia.id), play(f, f.mia.id)]);
    expect(results.map(r => r.body.marbles).sort()).toEqual([0, 0, 2]);
    expect(await f.balance(f.mia.id)).toBe(1200);
  });

  it('404s for an unknown kid', async () => {
    const f = await family();
    expect((await play(f, 'nobody')).status).toBe(404);
  });
});
