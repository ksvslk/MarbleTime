import {describe, expect, it} from 'vitest';
import {budgetOf, changedBudget, defaultBase, defaultMax, jobMinutes, keptPromise, maxCeiling, rewardFor} from '../src/domain/budget';
import {DAY, family, setup} from './helpers';

const kid = (age: number, balanceMin: number, budget: {dailyMaxMin?: number; dailyBaseMin?: number} = {}) => ({age, balanceSec: balanceMin * 60, ...budget});

describe('the daily budget (docs/08 §1)', () => {
  it('has a ceiling by age from the guidance, and a default jar of 60 under 7 and 90 from 7, half of it given', () => {
    expect([3, 6, 7, 12].map(maxCeiling)).toEqual([60, 60, 120, 120]);
    expect([3, 6, 7, 12].map(defaultMax)).toEqual([60, 60, 90, 90]);
    expect([10, 30, 60, 70, 90, 120].map(defaultBase)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(budgetOf({age: 5})).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
    expect(budgetOf({age: 8})).toEqual({dailyMaxMin: 90, dailyBaseMin: 50});
  });

  it('reads stored values by the rules: whole marbles, within the age ceiling, the base within the maximum', () => {
    expect(budgetOf({age: 5, dailyMaxMin: 120, dailyBaseMin: 240})).toEqual({dailyMaxMin: 60, dailyBaseMin: 60});
    expect(budgetOf({age: 9, dailyBaseMin: 35})).toEqual({dailyMaxMin: 90, dailyBaseMin: 40});
    expect(budgetOf({age: 9, dailyBaseMin: 0})).toEqual({dailyMaxMin: 90, dailyBaseMin: 0});
    expect(budgetOf({age: 9, dailyMaxMin: 5})).toEqual({dailyMaxMin: 10, dailyBaseMin: 10});
  });

  it('clamps a parent\'s change instead of refusing it', () => {
    const now = {dailyMaxMin: 90, dailyBaseMin: 50};
    expect(changedBudget(undefined, 4, {})).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
    expect(changedBudget(undefined, 4, {dailyMaxMin: 120})).toEqual({dailyMaxMin: 60, dailyBaseMin: 30});
    expect(changedBudget(now, 8, {dailyMaxMin: 30})).toEqual({dailyMaxMin: 30, dailyBaseMin: 30});
    expect(changedBudget(now, 8, {dailyMaxMin: 120})).toEqual({dailyMaxMin: 120, dailyBaseMin: 50});
    expect(changedBudget(now, 6, {})).toEqual({dailyMaxMin: 60, dailyBaseMin: 50});
    expect(changedBudget(now, 8, {dailyBaseMin: 100})).toEqual({dailyMaxMin: 90, dailyBaseMin: 90});
  });

  it('reads job minutes as 1–3 whole marbles, rounding up', () => {
    expect([5, 10, 15, 20, 25, 30, 45, 120].map(jobMinutes)).toEqual([10, 10, 20, 20, 30, 30, 30, 30]);
  });
});

describe('what approving a job gives (rewardFor)', () => {
  it('puts the job\'s marbles in the jar while there is room for them', () => {
    // Under 7: a 60-minute jar with 30 given, so 30 to earn.
    expect(rewardFor(kid(5, 0), {minutes: 30})).toEqual({reward: 'marbles', minutesCredited: 30});
    expect(rewardFor(kid(5, 10), {minutes: 20})).toEqual({reward: 'marbles', minutesCredited: 20});
    // From 7: 90 with 50 given, so 40 to earn.
    expect(rewardFor(kid(8, 10), {minutes: 30})).toEqual({reward: 'marbles', minutesCredited: 30});
  });

  it('gives the part that fits and a character for the rest when the job is worth more than the room left', () => {
    expect(rewardFor(kid(5, 10), {minutes: 30})).toEqual({reward: 'character', minutesCredited: 20});
    expect(rewardFor(kid(8, 30), {minutes: 30})).toEqual({reward: 'character', minutesCredited: 10});
    // An odd balance from older data: 15 minutes of room is one marble.
    expect(rewardFor(kid(5, 15), {minutes: 30})).toEqual({reward: 'character', minutesCredited: 10});
    // A job that fits exactly fills the jar and is just marbles.
    expect(rewardFor(kid(5, 10), {minutes: 20})).toEqual({reward: 'marbles', minutesCredited: 20});
  });

  it('leaves out room already promised to the kid\'s other waiting claims', () => {
    expect(rewardFor(kid(5, 0), {minutes: 20}, 10)).toEqual({reward: 'marbles', minutesCredited: 20});
    expect(rewardFor(kid(5, 0), {minutes: 20}, 20)).toEqual({reward: 'character', minutesCredited: 10});
    expect(rewardFor(kid(5, 0), {minutes: 20}, 30)).toEqual({reward: 'character', minutesCredited: 0});
  });

  it('keeps a promise at approval; only the jar\'s maximum can cut it, and the cut is a character (keptPromise)', () => {
    const marbles = {reward: 'marbles' as const, minutesCredited: 20};
    expect(keptPromise(kid(5, 0), marbles)).toEqual(marbles);
    expect(keptPromise(kid(5, 10), marbles)).toEqual(marbles);
    expect(keptPromise(kid(5, 20), marbles)).toEqual({reward: 'character', minutesCredited: 10});
    expect(keptPromise(kid(5, 30), marbles)).toEqual({reward: 'character', minutesCredited: 0});
    // More room than when it was promised changes nothing: the card showed a character.
    expect(keptPromise(kid(5, 0), {reward: 'character', minutesCredited: 0})).toEqual({reward: 'character', minutesCredited: 0});
    expect(keptPromise(kid(5, 30), {reward: 'praise', minutesCredited: 0})).toEqual({reward: 'praise', minutesCredited: 0});
  });

  it('gives a character token instead of time once the jar is full (less than a marble of room)', () => {
    expect(rewardFor(kid(5, 30), {minutes: 10})).toEqual({reward: 'character', minutesCredited: 0});
    expect(rewardFor(kid(5, 25), {minutes: 10})).toEqual({reward: 'character', minutesCredited: 0});
    expect(rewardFor(kid(8, 90), {minutes: 30})).toEqual({reward: 'character', minutesCredited: 0});
    // A base as big as the jar: everything earns characters.
    expect(rewardFor(kid(9, 0, {dailyMaxMin: 60, dailyBaseMin: 60}), {minutes: 10})).toEqual({reward: 'character', minutesCredited: 0});
    // Marbles never disappear: a jar that is over full (a bonus, or an older bigger budget) gives characters too.
    expect(rewardFor(kid(5, 50), {minutes: 10})).toEqual({reward: 'character', minutesCredited: 0});
  });

  it('reads old job values and budgets by today\'s rules', () => {
    expect(rewardFor(kid(5, 0, {dailyBaseMin: 25}), {minutes: 15})).toEqual({reward: 'marbles', minutesCredited: 20});
    expect(rewardFor(kid(9, 0, {dailyBaseMin: 240}), {minutes: 15})).toEqual({reward: 'character', minutesCredited: 0});
  });
});

describe('approving through the API: the same rule on the phone and on the TV', () => {
  type Fixture = Awaited<ReturnType<typeof family>>;
  /** Approves Mia's "Toys away" on a fresh day, on the phone or on the TV. */
  const approveToys = async (f: Fixture, on: 'phone' | 'tv' = 'phone') => {
    f.clock.now += DAY;
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const res = on === 'phone' ? await f.mom.post(`/claims/${claim.id}/approve`) : await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'});
    return res.body;
  };

  it('fills the jar with marbles, then gives character tokens, whoever approves', async () => {
    const f = await family();
    expect(await approveToys(f, 'phone')).toMatchObject({status: 'approved', reward: 'marbles', minutesCredited: 10});
    expect(await approveToys(f, 'tv')).toMatchObject({status: 'approved', decidedBy: 'tv', reward: 'marbles', minutesCredited: 10});
    expect(await approveToys(f, 'phone')).toMatchObject({reward: 'marbles', minutesCredited: 10});
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 1800, characterTokens: 0});
    expect(await approveToys(f, 'tv')).toMatchObject({reward: 'character', minutesCredited: 0});
    expect(await approveToys(f, 'phone')).toMatchObject({reward: 'character', minutesCredited: 0});
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 1800, characterTokens: 2});
    // Only the marbles are in the ledger (and in the hand-off).
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries.map((e: {deltaSec: number}) => e.deltaSec)).toEqual([600, 600, 600]);
  });

  it('fills the jar with the part that fits and gives a character for the rest', async () => {
    const f = await family();
    const {body: big} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 30, childIds: [f.mia.id]});
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
    f.clock.now += 1000; // so the ledger's newest entry is the job's
    const {body: claim} = await f.claim(f.mia.id, big.id);
    expect(claim.promised).toEqual({reward: 'character', minutes: 20});
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({minutes: 30, reward: 'character', minutesCredited: 20});
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 1800, characterTokens: 1});
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries[0]).toMatchObject({type: 'CHORE', deltaSec: 1200, handoff: 'PENDING'});
  });

  it('gives what the card showed at "I did it!": waiting claims hold their room, whatever is decided first', async () => {
    const f = await family();
    // Mia: a 60-minute jar, 30 given, so room for 3 marbles.
    const {body: big} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 20, childIds: [f.mia.id]});
    const {body: bed} = await f.mom.post('/chores', {title: 'Make the bed', minutes: 20, childIds: [f.mia.id]});
    const {body: first} = await f.claim(f.mia.id, big.id);
    const {body: second} = await f.claim(f.mia.id, bed.id);
    expect(first.promised).toEqual({reward: 'marbles', minutes: 20});
    expect(second.promised).toEqual({reward: 'character', minutes: 10});
    // The second is approved first, and the first gets a "not yet": both get exactly what they were shown.
    expect((await f.mom.post(`/claims/${second.id}/approve`)).body).toMatchObject({reward: 'character', minutesCredited: 10});
    expect((await f.mom.post(`/claims/${first.id}/reject`)).body).toMatchObject({status: 'rejected', promised: {reward: 'marbles', minutes: 20}});
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 600, characterTokens: 1});
    // Its room is free again for the next claim.
    const {body: third} = await f.claim(f.mia.id, f.toys.id);
    expect(third.promised).toEqual({reward: 'marbles', minutes: 10});
  });

  it('never goes over the maximum for a promise: a jar filled meanwhile turns the rest into a character', async () => {
    const f = await family();
    const {body: big} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 20, childIds: [f.mia.id]});
    const {body: claim} = await f.claim(f.mia.id, big.id);
    expect(claim.promised).toEqual({reward: 'marbles', minutes: 20});
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 20, reason: 'Kind'});
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({reward: 'character', minutesCredited: 10});
    expect(await f.child(f.mia.id)).toMatchObject({balanceSec: 1800, characterTokens: 1});
  });

  it('gives every job its TV time: a job once marked routine earns its marbles like any other', async () => {
    const f = await family();
    // The switch is gone: sending it changes nothing, and jobs always read as not routine.
    expect((await f.mom.patch(`/chores/${f.teeth.id}`, {routine: true})).body.routine).toBe(false);
    // A job stored as routine by an older version gives its minutes too.
    const stored = (await f.repo.getChore(f.familyId, f.teeth.id))!;
    await f.repo.putChore(f.familyId, {...stored, routine: true});
    const {body: claim} = await f.claim(f.leo.id, f.teeth.id);
    expect(claim.promised).toEqual({reward: 'marbles', minutes: 10});
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({reward: 'marbles', minutesCredited: 10});
    expect(await f.child(f.leo.id)).toMatchObject({balanceSec: 600});
    // A claim that was promised praise before the change keeps its promise.
    const {body: old} = await f.claim(f.mia.id, f.teeth.id);
    const waiting = (await f.repo.getClaim(f.familyId, old.id))!;
    await f.repo.deleteClaim(f.familyId, waiting);
    await f.repo.createClaim(f.familyId, {...waiting, routine: true, promised: {reward: 'praise', minutes: 0}});
    expect((await f.mom.post(`/claims/${old.id}/approve`)).body).toMatchObject({reward: 'praise', minutesCredited: 0});
    // And one from before promises existed gets what the jar has room for.
    const {body: older} = await f.claim(f.mia.id, f.toys.id);
    const {promised: _, ...before} = (await f.repo.getClaim(f.familyId, older.id))!;
    await f.repo.deleteClaim(f.familyId, {...before, promised: undefined} as never);
    await f.repo.createClaim(f.familyId, {...before, routine: true});
    expect((await f.mom.post(`/claims/${older.id}/approve`)).body).toMatchObject({reward: 'marbles', minutesCredited: 10});
  });

  it('never lets two approvals at once overfill the jar', async () => {
    const f = await family();
    const {body: big} = await f.mom.post('/chores', {title: 'Big job', minutes: 30, childIds: [f.mia.id]});
    const {body: one} = await f.claim(f.mia.id, big.id);
    const {body: two} = await f.claim(f.mia.id, f.toys.id);
    const [a, b] = await Promise.all([f.mom.post(`/claims/${one.id}/approve`), f.tv.post(`/device/claims/${two.id}/decide`, {yes: true, pin: '1234'})]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const rewards = [a.body, b.body].map(c => `${c.reward}:${c.minutesCredited}`).sort();
    // Whichever came first filled the jar's 30 minutes; the other found it full or got what was left.
    expect([['character:0', 'marbles:30'], ['marbles:10', 'marbles:20']]).toContainEqual(rewards);
    expect(await f.balance(f.mia.id)).toBe(1800);
  });
});

describe("the parent's name on approvals (\"– Dad\")", () => {
  it('is set with PATCH /me, before or after the family exists, and shown by GET /me', async () => {
    const t = await setup();
    const dad = t.parent('dad');
    expect((await dad.patch('/me', {name: '  Dad '})).body).toEqual({parent: {id: 'dad', email: 'dad@example.com', name: 'Dad'}, family: null});
    await dad.post('/family', {name: 'Fam', lang: 'en', timezone: 'UTC', pin: '1234'});
    expect((await dad.get('/me')).body.parent).toEqual({id: 'dad', email: 'dad@example.com', name: 'Dad'});
    expect((await dad.patch('/me', {name: 'Isa'})).body).toMatchObject({parent: {name: 'Isa'}, family: {name: 'Fam'}});
    expect((await t.open.patch('/me', {name: 'X'})).status).toBe(401);
  });

  it('signs approvals by a named parent; not approvals on the TV, by a parent without a name, or rejections', async () => {
    const f = await family();
    const {body: unnamed} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.mom.post(`/claims/${unnamed.id}/approve`)).body.approverName).toBeUndefined();
    await f.mom.patch('/me', {name: 'Mom'});
    const {body: named} = await f.claim(f.leo.id, f.teeth.id);
    expect((await f.mom.post(`/claims/${named.id}/approve`)).body).toMatchObject({approverName: 'Mom', decidedBy: 'parent'});
    const {body: onTv} = await f.claim(f.mia.id, f.teeth.id);
    expect((await f.tv.post(`/device/claims/${onTv.id}/decide`, {yes: true, pin: '1234'})).body.approverName).toBeUndefined();
    f.clock.now += DAY;
    const {body: no} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.mom.post(`/claims/${no.id}/reject`)).body.approverName).toBeUndefined();
    // The TV sees who noticed.
    const {body: state} = await f.tv.get('/device/state');
    expect(state.claims.find((c: {id: string}) => c.id === named.id).approverName).toBe('Mom');
  });
});
