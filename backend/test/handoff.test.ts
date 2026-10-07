import {describe, expect, it} from 'vitest';
import {CHANGED} from '../src/domain/realtime';
import {DAY, family, MONDAY_NOON} from './helpers';

type Fixture = Awaited<ReturnType<typeof family>>;

/** Monday 5 October 2026 ends at 21:00 UTC in Tallinn (UTC+3): Tuesday's local midnight. */
const TUESDAY_MIDNIGHT = Date.UTC(2026, 9, 5, 21, 0);

/** Approves a fresh claim for Mia's 10-minute job (one per day: moves the clock a day each time). */
async function earn10(f: Fixture) {
  f.clock.now += DAY;
  const {body: claim} = await f.claim(f.mia.id, f.toys.id);
  return (await f.mom.post(`/claims/${claim.id}/approve`)).body;
}

/** Approves Mia's jobs on the current day, one claim each (adds jobs as needed); returns the claims' rewards. */
async function earnToday(f: Fixture, jobs: number) {
  const rewards: string[] = [];
  for (let i = 0; i < jobs; i++) {
    const {body: job} = await f.mom.post('/chores', {title: `Job ${f.clock.now} ${i}`, minutes: 10, childIds: [f.mia.id]});
    const {body: claim} = await f.claim(f.mia.id, job.id);
    rewards.push((await f.mom.post(`/claims/${claim.id}/approve`)).body.reward);
  }
  return rewards;
}

const adjust = (f: Fixture, deltaMin: number, id?: string) =>
  f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin, reason: deltaMin > 0 ? 'Helped grandma' : 'Hit her brother', ...(id && {id})});

const handoff = async (f: Fixture) => (await f.mom.get(`/children/${f.mia.id}/handoff`)).body;
const settle = async (f: Fixture, status: 'DONE' | 'SKIPPED', entryIds?: string[]) =>
  (await f.mom.post(`/children/${f.mia.id}/handoff`, {status, entryIds: entryIds ?? (await handoff(f)).entries.map((e: {id: string}) => e.id)})).body;
const ledger = async (f: Fixture) => (await f.mom.get(`/children/${f.mia.id}/ledger?limit=200`)).body.entries as {type: string; deltaSec: number; reason: string; createdBy: string; createdAt: number; handoff?: string}[];
const handoffEntries = async (f: Fixture) => (await ledger(f)).filter(e => e.type === 'HANDOFF');
const debt = async (f: Fixture) => (await f.repo.getChild(f.familyId, f.mia.id))!.debtSec;

describe('hand-off to Amazon Kids', () => {
  it('suggests pending earned minutes (jobs, bonuses) minus the penalty debt; DONE pays the debt at once', async () => {
    const f = await family();
    await earn10(f);
    f.clock.now += 1000;
    await adjust(f, 10);
    let pending = await handoff(f);
    expect(pending.pendingMinutes).toBe(20);
    expect(pending.entries.map((e: {type: string}) => e.type)).toEqual(['BONUS', 'CHORE']);

    await adjust(f, -10);
    pending = await handoff(f);
    expect(pending.pendingMinutes).toBe(10);
    expect(pending.entries).toHaveLength(2); // penalties are not hand-off entries

    // The parent adds 10 min in Amazon Kids and marks it done: the debt is paid.
    expect(await settle(f, 'DONE')).toEqual({pendingMinutes: 0, entries: []});
    expect(await debt(f)).toBe(0);
    await earn10(f);
    expect((await handoff(f)).pendingMinutes).toBe(10);
  });

  it('keeps handed-off minutes in the jar for the rest of the day (the daily maximum holds), and takes them out at local midnight', async () => {
    const f = await family();
    // Mia's jar: 60 minutes, 30 given, 30 to earn. Fill it today.
    expect(await earnToday(f, 4)).toEqual(['marbles', 'marbles', 'marbles', 'character']);
    f.clock.now += 3 * 3600_000;
    expect(await settle(f, 'DONE')).toEqual({pendingMinutes: 0, entries: []});
    // Still today's TV: the marbles stay on the TV and the jar stays full.
    expect(await f.balance(f.mia.id)).toBe(1800);
    expect((await f.tv.get('/device/state')).body.children[0].balanceSec).toBe(1800);
    expect(await earnToday(f, 1)).toEqual(['character']);
    expect(await handoffEntries(f)).toEqual([]);
    // A millisecond before Tallinn's midnight (21:00 UTC), nothing has moved; at midnight, the first read settles.
    f.clock.now = TUESDAY_MIDNIGHT - 1;
    expect(await f.balance(f.mia.id)).toBe(1800);
    f.clock.now = TUESDAY_MIDNIGHT + 5 * 3600_000; // the first read comes in the morning
    expect(await f.balance(f.mia.id)).toBe(0);
    expect(await handoffEntries(f)).toEqual([{
      id: expect.any(String), childId: f.mia.id, deltaSec: -1800, type: 'HANDOFF', reason: 'Handed off on 2026-10-05', createdBy: 'system',
      createdAt: TUESDAY_MIDNIGHT, // dated at the midnight, whenever it was first read
    }]);
    // Room again for Tuesday.
    expect(await earnToday(f, 1)).toEqual(['marbles']);
    expect(await f.balance(f.mia.id)).toBe(600);
  });

  it('settles on the first read or write after midnight, once; a write that settles tells the family, a read just shows it', async () => {
    const f = await family();
    await earnToday(f, 1);
    await settle(f, 'SKIPPED');
    f.clock.now = TUESDAY_MIDNIGHT + 1000;
    const mom = (await f.openRealtime({token: 'jwt-mom'}))!; // connections last 3 hours: listen from now
    f.realtime.splice(0);
    // Reads at the same moment: one HANDOFF entry, and nobody is told.
    const [bundle, state, pending] = await Promise.all([f.mom.get('/family'), f.tv.get('/device/state'), f.mom.get(`/children/${f.mia.id}/handoff`)]);
    expect([bundle.body.children[0].balanceSec, state.body.children[0].balanceSec, pending.body.pendingMinutes]).toEqual([0, 0, 0]);
    expect((await handoffEntries(f)).map(e => [e.deltaSec, e.reason])).toEqual([[-600, 'Handed off on 2026-10-05']]);
    expect(f.realtime).toEqual([]);
    // A write that settles says so, even when the write itself fails.
    const g = await family();
    await earnToday(g, 1);
    await g.mom.post(`/children/${g.mia.id}/handoff`, {status: 'DONE', entryIds: (await g.mom.get(`/children/${g.mia.id}/handoff`)).body.entries.map((e: {id: string}) => e.id)});
    g.clock.now = TUESDAY_MIDNIGHT + 1000;
    const listener = (await g.openRealtime({token: 'jwt-mom'}))!;
    g.realtime.splice(0);
    const minus = await g.mom.post(`/children/${g.mia.id}/adjust`, {deltaMin: -10, reason: 'Late to bed'});
    expect(minus.status).toBe(409); // the jar emptied at midnight: nothing left to take
    expect(g.realtime).toEqual([{connectionId: listener, message: CHANGED}]);
    expect(mom).toMatch(/^conn-/);
  });

  it('counts marks made before today; today\'s wait for the next midnight', async () => {
    const f = await family();
    await earnToday(f, 1);
    await settle(f, 'DONE'); // Monday's mark: 10 minutes due
    f.clock.now = TUESDAY_MIDNIGHT + 8 * 3600_000; // Tuesday 08:00, nothing read yet
    await earnToday(f, 2); // the approvals settle Monday's 10 first, then fill the jar with Tuesday's 20
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-600]);
    await settle(f, 'DONE'); // Tuesday's mark: 20 minutes due
    expect(await f.balance(f.mia.id)).toBe(1200);
    f.clock.now = TUESDAY_MIDNIGHT + DAY; // Wednesday's midnight
    expect(await f.balance(f.mia.id)).toBe(0);
    expect((await handoffEntries(f)).map(e => [e.deltaSec, e.reason])).toEqual([[-1200, 'Handed off on 2026-10-06'], [-600, 'Handed off on 2026-10-05']]);
  });

  it('never takes minutes out twice: a minus already took its own (the debt a DONE pays)', async () => {
    const f = await family();
    await earnToday(f, 2);
    await adjust(f, -10); // the jar: 20 → 10; the debt: 10
    expect((await handoff(f)).pendingMinutes).toBe(10);
    await settle(f, 'DONE'); // 20 settled, 10 paid the debt: 10 are due to leave
    expect(await debt(f)).toBe(0);
    expect(await f.balance(f.mia.id)).toBe(600);
    f.clock.now = TUESDAY_MIDNIGHT;
    expect(await f.balance(f.mia.id)).toBe(0);
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-600]);
  });

  it('lets a skip pay the debt with what the jar couldn\'t give up, so no minutes stay in the jar for good', async () => {
    const f = await family();
    await earnToday(f, 1);
    await adjust(f, -10); // a minus took the 10 minutes: the jar is empty, the debt is 10
    expect(await settle(f, 'SKIPPED')).toEqual({pendingMinutes: 0, entries: []}); // skipping pays no debt today
    expect(await debt(f)).toBe(600);
    f.clock.now = TUESDAY_MIDNIGHT + 1000;
    expect(await f.balance(f.mia.id)).toBe(0); // the jar had nothing to give up…
    expect(await debt(f)).toBe(0); // …so the 10 due paid the debt
    expect(await handoffEntries(f)).toEqual([]);
    // Tuesday's job is handed off in full, and leaves the jar empty at the next midnight: nothing orphaned.
    await earnToday(f, 1);
    expect((await handoff(f)).pendingMinutes).toBe(10);
    await settle(f, 'DONE');
    f.clock.now = TUESDAY_MIDNIGHT + DAY;
    expect(await f.balance(f.mia.id)).toBe(0);
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-600]);
  });

  it('pays the debt the same way when a minus after the hand-off took the minutes the same day', async () => {
    const f = await family();
    await earnToday(f, 1);
    await settle(f, 'DONE'); // added in Amazon Kids at noon: 10 due
    f.clock.now += 6 * 3600_000;
    await adjust(f, -10); // the evening: a minus takes those 10 from the jar; the debt is 10
    f.clock.now = TUESDAY_MIDNIGHT + 1000;
    expect([await f.balance(f.mia.id), await debt(f)]).toEqual([0, 0]);
    await earnToday(f, 1);
    expect((await handoff(f)).pendingMinutes).toBe(10);
  });

  it('settles the same entries once, marked twice or at the same moment', async () => {
    const f = await family();
    await earnToday(f, 2);
    const ids = (await handoff(f)).entries.map((e: {id: string}) => e.id);
    await Promise.all([settle(f, 'DONE', ids), settle(f, 'DONE', ids)]);
    expect(await settle(f, 'DONE', [...ids, 'unknown'])).toEqual({pendingMinutes: 0, entries: []});
    expect(await settle(f, 'SKIPPED', ids)).toEqual({pendingMinutes: 0, entries: []});
    expect((await ledger(f)).filter(e => e.type === 'CHORE').map(e => e.handoff)).toEqual(['DONE', 'DONE']);
    f.clock.now = TUESDAY_MIDNIGHT;
    expect(await f.balance(f.mia.id)).toBe(0);
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-1200]);
  });

  it('keeps the jar right when the settlement and an approval land at the same moment', async () => {
    const f = await family();
    await earnToday(f, 3); // the jar is full
    await settle(f, 'DONE');
    f.clock.now = TUESDAY_MIDNIGHT + 8 * 3600_000;
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const [state, approved] = await Promise.all([f.tv.get('/device/state'), f.mom.post(`/claims/${claim.id}/approve`)]);
    expect(state.status).toBe(200);
    // Whichever came first, the approval saw Tuesday's empty jar.
    expect(approved.body).toMatchObject({reward: 'marbles', minutesCredited: 10});
    expect(await f.balance(f.mia.id)).toBe(600);
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-1800]);
  });

  it('settles more entries than one transaction holds', async () => {
    const f = await family();
    for (let i = 0; i < 150; i++) {
      await f.mom.post(`/children/${f.leo.id}/adjust`, {deltaMin: 10, reason: `Bonus ${i}`});
      f.clock.now += 1000;
    }
    const ids = (await f.mom.get(`/children/${f.leo.id}/handoff`)).body.entries.map((e: {id: string}) => e.id);
    expect(ids).toHaveLength(150);
    expect((await f.mom.post(`/children/${f.leo.id}/handoff`, {status: 'DONE', entryIds: ids})).body).toEqual({pendingMinutes: 0, entries: []});
    f.clock.now = TUESDAY_MIDNIGHT;
    expect(await f.balance(f.leo.id)).toBe(0);
    const entries = (await f.mom.get(`/children/${f.leo.id}/ledger?limit=200`)).body.entries.filter((e: {type: string}) => e.type === 'HANDOFF');
    expect(entries.map((e: {deltaSec: number}) => e.deltaSec)).toEqual([-150 * 600]);
  });

  it('starts from now on stores with entries settled before HANDOFF entries existed (nothing is backfilled)', async () => {
    const f = await family();
    await earnToday(f, 1);
    // As an older server left it: the entry DONE, the jar untouched, nothing due.
    const [entry] = await f.repo.pendingEntries(f.familyId, f.mia.id);
    expect(await f.repo.settleEntries(f.familyId, f.mia.id, [entry], 'DONE', 0, {sec: 0, day: '2026-10-05'})).toBe(true);
    f.clock.now = TUESDAY_MIDNIGHT + DAY;
    await earnToday(f, 1);
    await settle(f, 'DONE');
    f.clock.now += DAY;
    expect((await handoffEntries(f)).map(e => e.deltaSec)).toEqual([-600]);
    expect(await f.balance(f.mia.id)).toBe(600); // the old 10 minutes stay where the old server left them
    expect(MONDAY_NOON).toBeLessThan(TUESDAY_MIDNIGHT);
  });
});
