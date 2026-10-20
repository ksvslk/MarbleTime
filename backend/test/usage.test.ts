import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {DAY, family, MINUTE} from './helpers';

type F = Awaited<ReturnType<typeof family>>;
const watch = (f: F, childId: string, seconds: number, id: string = randomUUID()) => f.tv.post('/device/usage', {id, childId, seconds});

describe('watched time: the jar is the time left today', () => {
  it('takes watched time out of the jar: today\'s base first, then earned time', async () => {
    const f = await family();
    // Mia: a 60-minute jar with 30 given. She earns one marble.
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 600, usedTodaySec: 0, leftTodaySec: 2400});

    const first = await watch(f, f.mia.id, 20 * 60);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({balanceSec: 600, usedTodaySec: 1200, leftTodaySec: 1200});
    // The next 15 minutes finish the base (10) and take 5 of the earned marble.
    expect((await watch(f, f.mia.id, 15 * 60)).body).toMatchObject({balanceSec: 300, usedTodaySec: 2100, leftTodaySec: 300});
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries.filter((e: {type: string}) => e.type === 'USAGE').map((e: {deltaSec: number; baseSec: number}) => [e.deltaSec, e.baseSec]).sort()).toEqual([[-300, 600], [0, 1200]].sort());
    // The TV and the phone see the same jar.
    const {body: state} = await f.tv.get('/device/state');
    expect(state.children.find((c: {id: string}) => c.id === f.mia.id)).toMatchObject({usedTodaySec: 2100, leftTodaySec: 300});
  });

  it('never goes below an empty jar, and counts a resend once', async () => {
    const f = await family();
    const id = randomUUID();
    expect((await watch(f, f.mia.id, 25 * 60, id)).body).toMatchObject({usedTodaySec: 1500, leftTodaySec: 300});
    expect((await watch(f, f.mia.id, 25 * 60, id)).body).toMatchObject({usedTodaySec: 1500, leftTodaySec: 300});
    // 10 more minutes are reported, but only 5 were left.
    expect((await watch(f, f.mia.id, 10 * 60)).body).toMatchObject({balanceSec: 0, usedTodaySec: 1800, leftTodaySec: 0});
    expect((await watch(f, f.mia.id, 60)).body).toMatchObject({usedTodaySec: 1800, leftTodaySec: 0});
    expect((await watch(f, 'nobody', 60)).status).toBe(404);
    expect((await watch(f, f.mia.id, 0)).status).toBe(400);
  });

  it('starts every day with the base again; earned time that wasn\'t watched is still there', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    await watch(f, f.mia.id, 30 * 60); // the whole base, none of the marble
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 600, usedTodaySec: 1800, leftTodaySec: 600});
    f.clock.now += DAY;
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 600, usedTodaySec: 0, leftTodaySec: 2400});
    expect((await watch(f, f.mia.id, 5 * 60)).body).toMatchObject({usedTodaySec: 300, leftTodaySec: 2100});
  });

  it('keeps watched plus left within the day\'s maximum: earned time already watched leaves no room to earn it again', async () => {
    const f = await family();
    const {body: big} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 30, childIds: [f.mia.id]});
    const {body: first} = await f.claim(f.mia.id, big.id);
    await f.mom.post(`/claims/${first.id}/approve`); // the jar is full: 30 given + 30 earned
    await watch(f, f.mia.id, 50 * 60); // the base and 20 of the earned minutes
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 600, usedTodaySec: 3000, leftTodaySec: 600});
    // 50 watched + 10 left = the 60-minute maximum, so the next job is a character, not more time.
    const {body: next} = await f.claim(f.mia.id, f.toys.id);
    expect(next.promised).toEqual({reward: 'character', minutes: 0});
    // Tomorrow the watched time is yesterday's: the unwatched marble is kept, and two more fit.
    f.clock.now += DAY;
    const {body: tomorrow} = await f.claim(f.mia.id, f.teeth.id);
    expect(tomorrow.promised).toEqual({reward: 'marbles', minutes: 10});
  });

  it('offers for the Amazon Kids hand-off only what is still in the jar', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    f.clock.now += MINUTE;
    expect((await f.mom.get(`/children/${f.mia.id}/handoff`)).body.pendingMinutes).toBe(10);
    await watch(f, f.mia.id, 36 * 60); // the base and 6 minutes of the marble
    expect((await f.mom.get(`/children/${f.mia.id}/handoff`)).body.pendingMinutes).toBe(4);
  });
});
