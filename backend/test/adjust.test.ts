import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {family} from './helpers';

type Fixture = Awaited<ReturnType<typeof family>>;

const adjust = (f: Fixture, deltaMin: number, id?: string) =>
  f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin, reason: deltaMin > 0 ? 'Helped grandma' : 'Hit her brother', ...(id && {id})});

describe('bonus and taken-away minutes', () => {
  it('adds a BONUS (handed off to Amazon Kids) and takes minutes away as a PENALTY (not handed off)', async () => {
    const f = await family();
    const bonus = await adjust(f, 15);
    expect(bonus.status).toBe(200);
    expect(bonus.body.balanceSec).toBe(900);
    expect(bonus.body.entry).toMatchObject({type: 'BONUS', deltaSec: 900, reason: 'Helped grandma', createdBy: 'parent:mom', handoff: 'PENDING'});
    const minus = await adjust(f, -5);
    expect(minus.body.balanceSec).toBe(600);
    expect(minus.body.entry).toMatchObject({type: 'PENALTY', deltaSec: -300, reason: 'Hit her brother'});
    expect(minus.body.entry.handoff).toBeUndefined();
  });

  it('never goes below an empty jar: it takes what is there, records that, and the debt grows by it', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`); // 10 minutes in the jar, waiting for the hand-off
    const minus = await adjust(f, -20);
    expect(minus.status).toBe(200);
    expect(minus.body).toEqual({balanceSec: 0, entry: expect.objectContaining({type: 'PENALTY', deltaSec: -600})});
    // The 10 earned minutes were taken away again, so there is nothing to add in Amazon Kids.
    expect((await f.mom.get(`/children/${f.mia.id}/handoff`)).body.pendingMinutes).toBe(0);
  });

  it('answers 409 empty_jar when there is nothing to take, and writes nothing', async () => {
    const f = await family();
    const res = await adjust(f, -5);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('empty_jar');
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries).toEqual([]);
    expect(await f.balance(f.mia.id)).toBe(0);
  });

  it('counts a repeat with the same client id once, even after the jar changed', async () => {
    const f = await family();
    await adjust(f, 20);
    const id = randomUUID();
    const first = await adjust(f, -10, id);
    expect(first.body.balanceSec).toBe(600);
    await adjust(f, 30);
    const again = await adjust(f, -10, id);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({balanceSec: 2400, entry: first.body.entry});
    const penalties = (await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries.filter((e: {type: string}) => e.type === 'PENALTY');
    expect(penalties).toHaveLength(1);
    // A repeat of a bonus is ignored as well.
    const bonusId = randomUUID();
    await adjust(f, 5, bonusId);
    await adjust(f, 5, bonusId);
    expect(await f.balance(f.mia.id)).toBe(2700);
  });

  it('never takes more than the jar holds when two minuses arrive at the same moment', async () => {
    const f = await family();
    await adjust(f, 10);
    const results = await Promise.all([adjust(f, -10), adjust(f, -10)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await f.balance(f.mia.id)).toBe(0);
  });

  it('lists the ledger newest first, with a limit', async () => {
    const f = await family();
    for (const delta of [5, 10, 15]) {
      await adjust(f, delta);
      f.clock.now += 1000;
    }
    const {body} = await f.mom.get(`/children/${f.mia.id}/ledger?limit=2`);
    expect(body.entries.map((e: {deltaSec: number}) => e.deltaSec)).toEqual([900, 600]);
    expect((await f.mom.get('/children/nobody/ledger')).status).toBe(404);
    expect((await f.mom.post('/children/nobody/adjust', {deltaMin: 5, reason: 'x'})).status).toBe(404);
  });
});
