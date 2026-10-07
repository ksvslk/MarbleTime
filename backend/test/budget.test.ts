import {describe, expect, it} from 'vitest';
import {budgetOf, changedBudget, defaultBase, defaultMax, jobMinutes, maxCeiling, rewardFor} from '../src/domain/budget';
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
  it('praises a routine job, crediting nothing, whatever the jar holds', () => {
    expect(rewardFor(kid(5, 0), {minutes: 30, routine: true})).toEqual({reward: 'praise', minutesCredited: 0});
    expect(rewardFor(kid(5, 30), {minutes: 10, routine: true})).toEqual({reward: 'praise', minutesCredited: 0});
  });

  it('puts the job\'s marbles in the jar while there is room for them', () => {
    // Under 7: a 60-minute jar with 30 given, so 30 to earn.
    expect(rewardFor(kid(5, 0), {minutes: 30, routine: false})).toEqual({reward: 'marbles', minutesCredited: 30});
    expect(rewardFor(kid(5, 10), {minutes: 20, routine: false})).toEqual({reward: 'marbles', minutesCredited: 20});
    // From 7: 90 with 50 given, so 40 to earn.
    expect(rewardFor(kid(8, 10), {minutes: 30, routine: false})).toEqual({reward: 'marbles', minutesCredited: 30});
  });

  it('credits only what fits, in whole marbles, when the job is worth more than the room left', () => {
    expect(rewardFor(kid(5, 10), {minutes: 30, routine: false})).toEqual({reward: 'marbles', minutesCredited: 20});
    expect(rewardFor(kid(8, 30), {minutes: 30, routine: false})).toEqual({reward: 'marbles', minutesCredited: 10});
    // An odd balance from older data: 15 minutes of room is one marble.
    expect(rewardFor(kid(5, 15), {minutes: 30, routine: false})).toEqual({reward: 'marbles', minutesCredited: 10});
  });

  it('gives a character token instead of time once the jar is full (less than a marble of room)', () => {
    expect(rewardFor(kid(5, 30), {minutes: 10, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
    expect(rewardFor(kid(5, 25), {minutes: 10, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
    expect(rewardFor(kid(8, 90), {minutes: 30, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
    // A base as big as the jar: everything earns characters.
    expect(rewardFor(kid(9, 0, {dailyMaxMin: 60, dailyBaseMin: 60}), {minutes: 10, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
    // Marbles never disappear: a jar that is over full (a bonus, or an older bigger budget) gives characters too.
    expect(rewardFor(kid(5, 50), {minutes: 10, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
  });

  it('reads old job values and budgets by today\'s rules', () => {
    expect(rewardFor(kid(5, 0, {dailyBaseMin: 25}), {minutes: 15, routine: false})).toEqual({reward: 'marbles', minutesCredited: 20});
    expect(rewardFor(kid(9, 0, {dailyBaseMin: 240}), {minutes: 15, routine: false})).toEqual({reward: 'character', minutesCredited: 0});
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

  it('credits part of a job when only part fits', async () => {
    const f = await family();
    const {body: big} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 30, childIds: [f.mia.id]});
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
    f.clock.now += 1000; // so the ledger's newest entry is the job's
    const {body: claim} = await f.claim(f.mia.id, big.id);
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({minutes: 30, reward: 'marbles', minutesCredited: 20});
    expect(await f.balance(f.mia.id)).toBe(1800);
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries[0]).toMatchObject({type: 'CHORE', deltaSec: 1200, handoff: 'PENDING'});
  });

  it('praises a routine job without a marble, even with room in the jar (the job is read as it was when claimed)', async () => {
    const f = await family();
    await f.mom.patch(`/chores/${f.teeth.id}`, {routine: true});
    const {body: claim} = await f.claim(f.leo.id, f.teeth.id);
    await f.mom.patch(`/chores/${f.teeth.id}`, {routine: false}); // too late for this claim
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({reward: 'praise', minutesCredited: 0});
    expect(await f.child(f.leo.id)).toMatchObject({balanceSec: 0, characterTokens: 0});
    expect((await f.mom.get(`/children/${f.leo.id}/ledger`)).body.entries).toEqual([]);
    // A claim made before routine jobs existed follows the job as it is now.
    const {body: old} = await f.claim(f.mia.id, f.teeth.id);
    const stored = (await f.repo.getClaim(f.familyId, old.id))!;
    const {routine: _, ...before} = stored;
    await f.repo.deleteClaim(f.familyId, stored);
    await f.repo.createClaim(f.familyId, before);
    await f.mom.patch(`/chores/${f.teeth.id}`, {routine: true});
    expect((await f.mom.post(`/claims/${old.id}/approve`)).body).toMatchObject({reward: 'praise'});
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
