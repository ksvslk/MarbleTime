import {describe, expect, it} from 'vitest';
import {family, MONDAY_NOON, setup} from './helpers';

describe('onboarding', () => {
  it('shows no family until the parent creates one; the parent can create only one', async () => {
    const t = await setup();
    const dad = t.parent('dad');
    expect((await dad.get('/me')).body).toEqual({parent: {id: 'dad', email: 'dad@example.com'}, family: null});
    expect((await dad.get('/family')).body.error.code).toBe('no_family');

    const created = await dad.post('/family', {name: '  The Tammes ', lang: 'et', timezone: 'Europe/Tallinn', pin: '0042'});
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String), name: 'The Tammes', lang: 'et', timezone: 'Europe/Tallinn', caps: false, voice: true, hasPin: true, createdAt: MONDAY_NOON,
    });
    expect((await dad.get('/me')).body.family).toEqual(created.body);
    expect((await dad.post('/family', {name: 'Again', lang: 'en', timezone: 'UTC', pin: '1111'})).status).toBe(409);
    expect((await dad.get('/family')).body).toEqual({family: created.body, children: [], chores: [], devices: []});
  });

  it('needs a signed-in parent', async () => {
    const t = await setup();
    const res = await t.open.get('/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: {code: 'unauthorized', message: expect.any(String)}});
  });

  it('changes settings and the PIN (the TV gets the new hash)', async () => {
    const f = await family();
    const res = await f.mom.patch('/family', {name: 'Renamed', lang: 'de', caps: true, voice: false, pin: '9999'});
    expect(res.body).toMatchObject({name: 'Renamed', lang: 'de', caps: true, voice: false, hasPin: true});
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'})).status).toBe(403);
    expect((await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '9999'})).status).toBe(200);
    expect((await f.tv.get('/device/state')).body.family).toMatchObject({name: 'Renamed', lang: 'de', caps: true, voice: false});
  });
});

describe('kids', () => {
  it('gives a new kid the daily budget for their age: 60 minutes under 7, 90 from 7, the base half of it rounded up', async () => {
    const f = await family();
    expect(f.mia).toEqual({
      id: expect.any(String), name: 'Mia', avatar: 'bear', color: 'gold', age: 5, balanceSec: 0, dailyBaseMin: 30, dailyMaxMin: 60, characterTokens: 0,
      usedTodaySec: 0, leftTodaySec: 1800, puzzles: {on: true, stars: 0, starsNeeded: 5, doneToday: false, levels: {}, level: 0, levelAges: ['4–5', '6', '7–8', '9–10']},
    });
    expect(f.leo).toMatchObject({age: 8, dailyMaxMin: 90, dailyBaseMin: 50, characterTokens: 0});
    const {body: ann} = await f.mom.post('/children', {name: 'Ann', avatar: 'bunny', color: 'mint', age: 7, dailyMaxMin: 120});
    expect(ann).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 60});
    const {body: ben} = await f.mom.post('/children', {name: 'Ben', avatar: 'bear', color: 'sky', age: 9, dailyMaxMin: 70, dailyBaseMin: 0});
    expect(ben).toMatchObject({dailyMaxMin: 70, dailyBaseMin: 0});
  });

  it('keeps a kid\'s bedtime (past midnight too), removes it with null, and refuses a time that isn\'t one', async () => {
    const f = await family();
    const path = `/children/${f.mia.id}`;
    expect((await f.mom.patch(path, {bedtime: {from: '19:30', to: '07:00'}})).body.bedtime).toEqual({from: '19:30', to: '07:00'});
    expect((await f.mom.get('/family')).body.children.find((c: {id: string}) => c.id === f.mia.id).bedtime).toEqual({from: '19:30', to: '07:00'});
    expect((await f.mom.patch(path, {name: 'Mia'})).body.bedtime).toEqual({from: '19:30', to: '07:00'}); // other changes keep it
    expect((await f.mom.patch(path, {bedtime: null})).body.bedtime).toBeUndefined();
    for (const bad of [{from: '19:30'}, {from: '7:30', to: '19:00'}, {from: '24:00', to: '07:00'}, {from: '20:00', to: '20:00'}, 'never']) {
      expect((await f.mom.patch(path, {bedtime: bad})).status).toBe(400);
    }
  });

  it('never goes above the guideline for the age, and keeps the base within the maximum', async () => {
    const f = await family();
    // Under 7: 60 at most, whatever the parent asks.
    const {body: tim} = await f.mom.post('/children', {name: 'Tim', avatar: 'bear', color: 'mint', age: 4, dailyMaxMin: 120, dailyBaseMin: 90});
    expect(tim).toMatchObject({dailyMaxMin: 60, dailyBaseMin: 60});
    // Lowering the maximum pulls the base down with it; a base alone can't pass the maximum.
    expect((await f.mom.patch(`/children/${f.leo.id}`, {dailyMaxMin: 40})).body).toMatchObject({dailyMaxMin: 40, dailyBaseMin: 40});
    expect((await f.mom.patch(`/children/${f.leo.id}`, {dailyMaxMin: 120})).body).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 40});
    expect((await f.mom.patch(`/children/${f.leo.id}`, {dailyBaseMin: 120})).body).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 120});
    expect((await f.mom.patch(`/children/${f.leo.id}`, {dailyBaseMin: 60})).body).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 60});
    // Changing the age clamps the maximum (and the base with it); growing up doesn't raise it.
    expect((await f.mom.patch(`/children/${f.leo.id}`, {age: 6})).body).toMatchObject({age: 6, dailyMaxMin: 60, dailyBaseMin: 60});
    expect((await f.mom.patch(`/children/${f.leo.id}`, {age: 7})).body).toMatchObject({age: 7, dailyMaxMin: 60, dailyBaseMin: 60});
    expect((await f.mom.patch(`/children/${f.mia.id}`, {age: 7, dailyMaxMin: 120, dailyBaseMin: 30})).body).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 30});
    // The budget is a setting: not in the ledger, the balance or the hand-off.
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries).toEqual([]);
    expect((await f.mom.get(`/children/${f.mia.id}/handoff`)).body.pendingMinutes).toBe(0);
    expect((await f.tv.get('/device/state')).body.children[0]).toMatchObject({dailyMaxMin: 120, dailyBaseMin: 30, balanceSec: 0});
  });

  it('takes the budget in whole marbles only', async () => {
    const f = await family();
    for (const [field, value] of [['dailyBaseMin', -10], ['dailyBaseMin', 130], ['dailyBaseMin', 35], ['dailyBaseMin', '30'], ['dailyMaxMin', 0], ['dailyMaxMin', 125], ['dailyMaxMin', 65]] as const) {
      const res = await f.mom.patch(`/children/${f.mia.id}`, {[field]: value});
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(new RegExp(`^${field} `));
    }
  });

  it('reads kids stored before the budget by today\'s rules (defaults by age, old bases rounded up to marbles)', async () => {
    const f = await family();
    const store = async (fields: Record<string, unknown>) => {
      const {dailyBaseMin: _b, dailyMaxMin: _m, characterTokens: _t, ...stored} = (await f.repo.getChild(f.familyId, f.leo.id))!;
      await f.repo.deleteChild(f.familyId, f.leo.id);
      await f.repo.putChild(f.familyId, {...stored, ...fields});
      return (await f.mom.get('/family')).body.children[1];
    };
    // Before the daily base existed (and with the brain games' old fields): the defaults for 8.
    expect(await store({games: {topics: ['words'], dailyCapMarbles: 4}, gameDay: '2026-10-04', gameMarbles: 2})).toEqual({...f.leo, dailyBaseMin: 50, dailyMaxMin: 90});
    // An old base of 35 (steps of 5) rounds up to 40; one above the maximum is the maximum.
    expect(await store({dailyBaseMin: 35})).toMatchObject({dailyBaseMin: 40, dailyMaxMin: 90, characterTokens: 0});
    expect(await store({dailyBaseMin: 240})).toMatchObject({dailyBaseMin: 90});
    expect(await store({dailyBaseMin: 25, dailyMaxMin: 60, age: 5})).toMatchObject({dailyBaseMin: 30, dailyMaxMin: 60});
  });

  it('edits a kid without touching the balance or the tokens', async () => {
    const f = await family();
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
    await f.giveTokens(f.leo.id, 2);
    expect((await f.mom.patch(`/children/${f.mia.id}`, {name: 'Mia-Liis', age: 6})).body).toMatchObject({name: 'Mia-Liis', age: 6, balanceSec: 600});
    expect((await f.mom.patch(`/children/${f.leo.id}`, {color: 'mint'})).body).toMatchObject({color: 'mint', characterTokens: 2});
    expect((await f.mom.patch('/children/nobody', {age: 4})).status).toBe(404);
  });

  it('removes a kid and everything about them; jobs lose the kid, and a job left with nobody goes', async () => {
    const f = await family();
    await f.giveTokens(f.mia.id, 1);
    const {body: claim} = await f.claim(f.mia.id, f.teeth.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a dragon who loves pancakes'});
    expect((await f.mom.delete(`/children/${f.mia.id}`)).status).toBe(204);
    expect((await f.mom.delete(`/children/${f.mia.id}`)).status).toBe(204);

    const {body: bundle} = await f.mom.get('/family');
    expect(bundle.children.map((c: {id: string}) => c.id)).toEqual([f.leo.id]);
    expect(bundle.chores).toEqual([{...f.teeth, childIds: [f.leo.id]}]);
    expect((await f.mom.get('/claims')).body.claims).toEqual([]);
    expect(await f.repo.entries(f.familyId, f.mia.id, 50)).toEqual([]);
    expect(await f.repo.pendingEntries(f.familyId, f.mia.id)).toEqual([]);
    expect(await f.repo.listCharacters(f.familyId)).toEqual([]);
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).status).toBe(404);
    // The drawing that was under way finds the kid gone and stores nothing.
    expect((await f.runDrawing()).map(r => r.status)).toEqual(['skipped']);
  });
});

describe('jobs', () => {
  it('picks the icon and a card colour when the parent leaves them out; repeats daily by default', async () => {
    const f = await family();
    expect(f.toys).toMatchObject({title: 'Toys away', icon: 'toys', color: 'peach', minutes: 10, repeat: {kind: 'daily'}, childIds: [f.mia.id]});
    expect(f.teeth).toMatchObject({icon: 'tooth', color: 'mint'});
    expect(f.toys.routine).toBe(false);
    const {body: dishes} = await f.mom.post('/chores', {title: 'Tühjenda nõudepesumasin', minutes: 20, childIds: [f.leo.id, f.leo.id]});
    expect(dishes).toMatchObject({icon: 'table', color: 'sky', childIds: [f.leo.id]});
    const {body: own} = await f.mom.post('/chores', {title: 'Something', icon: 'heart', color: 'gold', minutes: 30, routine: true, childIds: [f.leo.id], repeat: {kind: 'weekdays', days: [5, 1]}});
    expect(own).toMatchObject({icon: 'heart', color: 'gold', minutes: 30, routine: false, repeat: {kind: 'weekdays', days: [1, 5]}}); // routine is accepted and ignored
  });

  it('edits only what is given (routine is ignored: every job gives its minutes), and refuses kids from elsewhere', async () => {
    const f = await family();
    const res = await f.mom.patch(`/chores/${f.toys.id}`, {minutes: 20, repeat: {kind: 'once'}});
    expect(res.body).toEqual({...f.toys, minutes: 20, repeat: {kind: 'once'}});
    expect((await f.mom.patch(`/chores/${f.toys.id}`, {routine: true})).body.routine).toBe(false);
    expect((await f.mom.patch(`/chores/${f.toys.id}`, {title: 'Toys back in the box'})).body).toMatchObject({routine: false, minutes: 20});
    expect((await f.mom.patch(`/chores/${f.toys.id}`, {routine: false})).body.routine).toBe(false);
    const stranger = await f.mom.patch(`/chores/${f.toys.id}`, {childIds: ['someone-else']});
    expect(stranger.status).toBe(400);
    expect(stranger.body.error.message).toContain('someone-else');
    expect((await f.mom.patch('/chores/nothing', {minutes: 10})).status).toBe(404);
    expect((await f.mom.delete(`/chores/${f.toys.id}`)).status).toBe(204);
    expect((await f.mom.get('/family')).body.chores).toEqual([f.teeth]);
  });

  it('reads jobs stored before whole marbles as 1–3 marbles (rounded up), and as not routine', async () => {
    const f = await family();
    const old = async (minutes: number) => {
      const id = `old-${minutes}`;
      await f.repo.putChore(f.familyId, {id, title: 'Old job', icon: 'star', color: 'mint', minutes, repeat: {kind: 'daily'}, childIds: [f.leo.id], createdAt: 1, updatedAt: 1});
      return (await f.mom.get('/family')).body.chores.find((k: {id: string}) => k.id === id);
    };
    expect(await old(5)).toMatchObject({minutes: 10, routine: false});
    expect(await old(15)).toMatchObject({minutes: 20});
    expect(await old(25)).toMatchObject({minutes: 30});
    expect(await old(120)).toMatchObject({minutes: 30});
    // A claim on such a job is worth what the job is read as.
    const {body: claim} = await f.claim(f.leo.id, 'old-5');
    expect(claim.minutes).toBe(10);
    expect((await f.mom.post(`/claims/${claim.id}/approve`)).body).toMatchObject({reward: 'marbles', minutesCredited: 10});
  });

  it("keeps each family's data to itself", async () => {
    const f = await family();
    const other = f.parent('stranger');
    await other.post('/family', {name: 'Other', lang: 'en', timezone: 'UTC', pin: '0000'});
    expect((await other.patch(`/children/${f.mia.id}`, {age: 9})).status).toBe(404);
    expect((await other.post(`/children/${f.mia.id}/adjust`, {deltaMin: 120, reason: 'x'})).status).toBe(404);
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    expect((await other.post(`/claims/${claim.id}/approve`)).status).toBe(404);
    expect((await other.get('/family')).body.children).toEqual([]);
  });
});

describe('the router', () => {
  it('answers unknown routes with 404, a wrong method with 405 and broken JSON with 400', async () => {
    const f = await family();
    expect((await f.mom.get('/nothing')).body.error.code).toBe('not_found');
    expect((await f.mom.delete('/family')).status).toBe(405);
    const broken = await f.mom.post('/children', '{"name": ');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('invalid_json');
  });

  it('sends JSON that nobody caches', async () => {
    const f = await family();
    const res = await f.mom.get('/me');
    expect(res.headers).toEqual({'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8'});
  });
});
