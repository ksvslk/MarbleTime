import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {family} from './helpers';

type Fixture = Awaited<ReturnType<typeof family>>;

/** Approves a fresh claim for Mia's 10-minute job (one per day: moves the clock a day each time). */
async function earn10(f: Fixture) {
  f.clock.now += 24 * 3600_000;
  const {body: claim} = await f.claim(f.mia.id, f.toys.id);
  await f.mom.post(`/claims/${claim.id}/approve`);
}

const adjust = (f: Fixture, deltaMin: number, id?: string) =>
  f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin, reason: deltaMin > 0 ? 'Helped grandma' : 'Hit her brother', ...(id && {id})});

const handoff = async (f: Fixture) => (await f.mom.get(`/children/${f.mia.id}/handoff`)).body;
const settle = async (f: Fixture, status: 'DONE' | 'SKIPPED', entryIds?: string[]) =>
  (await f.mom.post(`/children/${f.mia.id}/handoff`, {status, entryIds: entryIds ?? (await handoff(f)).entries.map((e: {id: string}) => e.id)})).body;

describe('hand-off to Amazon Kids', () => {
  it('suggests pending earned minutes (jobs, games, bonuses) minus the penalty debt', async () => {
    const f = await family();
    await earn10(f);
    f.clock.now += 1000;
    await f.tv.post('/device/games/results', {id: randomUUID(), childId: f.mia.id, topic: 'puzzles', correct: 3, total: 3, at: f.clock.now});
    f.clock.now += 1000;
    await adjust(f, 5);
    let pending = await handoff(f);
    expect(pending.pendingMinutes).toBe(25);
    expect(pending.entries.map((e: {type: string}) => e.type)).toEqual(['BONUS', 'GAME', 'CHORE']);

    await adjust(f, -5);
    pending = await handoff(f);
    expect(pending.pendingMinutes).toBe(20);
    expect(pending.entries).toHaveLength(3); // penalties are not hand-off entries

    // The parent adds 20 min in Amazon Kids and marks it done: the debt is paid.
    expect(await settle(f, 'DONE')).toEqual({pendingMinutes: 0, entries: []});
    await earn10(f);
    expect((await handoff(f)).pendingMinutes).toBe(10);
  });

  it('carries a debt bigger than what is pending over to the next hand-off, never below 0', async () => {
    const f = await family();
    await earn10(f);
    await adjust(f, -20);
    expect((await handoff(f)).pendingMinutes).toBe(0);
    await settle(f, 'DONE'); // 10 of the 20 are paid
    await earn10(f);
    await earn10(f);
    expect((await handoff(f)).pendingMinutes).toBe(10);
  });

  it('pays no debt with SKIPPED entries (no time was added for them)', async () => {
    const f = await family();
    await earn10(f);
    await adjust(f, -5);
    expect((await handoff(f)).pendingMinutes).toBe(5);
    await settle(f, 'SKIPPED');
    await earn10(f);
    expect((await handoff(f)).pendingMinutes).toBe(5);
  });

  it('ignores ids that are not pending, so marking twice is harmless', async () => {
    const f = await family();
    await earn10(f);
    const ids = (await handoff(f)).entries.map((e: {id: string}) => e.id);
    await settle(f, 'DONE', ids);
    expect(await settle(f, 'DONE', [...ids, 'unknown'])).toEqual({pendingMinutes: 0, entries: []});
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries.find((e: {type: string}) => e.type === 'CHORE').handoff).toBe('DONE');
  });
});

describe('bonus and penalty', () => {
  it('adds a BONUS (pending hand-off) or a PENALTY (none), and returns the balance', async () => {
    const f = await family();
    const bonus = await adjust(f, 15);
    expect(bonus.status).toBe(200);
    expect(bonus.body.balanceSec).toBe(900);
    expect(bonus.body.entry).toMatchObject({type: 'BONUS', deltaSec: 900, reason: 'Helped grandma', createdBy: 'parent:mom', handoff: 'PENDING'});
    const penalty = await adjust(f, -20);
    expect(penalty.body.balanceSec).toBe(-300); // balances can go below zero; the TV shows an empty jar
    expect(penalty.body.entry.type).toBe('PENALTY');
    expect(penalty.body.entry.handoff).toBeUndefined();
  });

  it('ignores a repeat with the same client id', async () => {
    const f = await family();
    const id = randomUUID();
    const first = await adjust(f, 10, id);
    const again = await adjust(f, 10, id);
    expect(again.body).toEqual(first.body);
    expect(await f.balance(f.mia.id)).toBe(600);
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries).toHaveLength(1);
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
  });
});
