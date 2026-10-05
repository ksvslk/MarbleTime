import {randomUUID} from 'node:crypto';
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
  it('adds a kid with game settings by age unless the parent chooses', async () => {
    const f = await family();
    expect(f.mia.games).toEqual({topics: ['numbers', 'puzzles'], dailyCapMarbles: 4});
    expect(f.leo.games).toEqual({topics: ['numbers', 'words', 'puzzles'], dailyCapMarbles: 4});
    const {body: ann} = await f.mom.post('/children', {name: 'Ann', avatar: 'bunny', color: 'mint', age: 3, games: {topics: ['words']}});
    expect(ann).toEqual({
      id: expect.any(String), name: 'Ann', avatar: 'bunny', color: 'mint', age: 3, balanceSec: 0, dailyBaseMin: 30, games: {topics: ['words'], dailyCapMarbles: 4},
    });
  });

  it('gives every kid a daily base (default 30 min) that the parent sets; it is not in the ledger or the hand-off', async () => {
    const f = await family();
    expect(f.mia.dailyBaseMin).toBe(30);
    const {body: none} = await f.mom.post('/children', {name: 'Ann', avatar: 'bunny', color: 'mint', age: 3, dailyBaseMin: 0});
    expect(none.dailyBaseMin).toBe(0);
    const {body: changed} = await f.mom.patch(`/children/${f.mia.id}`, {dailyBaseMin: 240});
    expect(changed).toMatchObject({dailyBaseMin: 240, balanceSec: 0});
    expect((await f.tv.get('/device/state')).body.children[0].dailyBaseMin).toBe(240);
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).body.entries).toEqual([]);
    expect((await f.mom.get(`/children/${f.mia.id}/handoff`)).body.pendingMinutes).toBe(0);
    for (const dailyBaseMin of [-5, 245, 7, 2.5, '30']) {
      const res = await f.mom.patch(`/children/${f.mia.id}`, {dailyBaseMin});
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/^dailyBaseMin /);
    }
  });

  it('reads kids stored before the daily base existed as 30 min', async () => {
    const f = await family();
    const {body: bundle} = await f.mom.get('/family');
    const {dailyBaseMin: _, ...stored} = (await f.repo.getChild(bundle.family.id, f.leo.id))!;
    await f.repo.deleteChild(bundle.family.id, f.leo.id);
    await f.repo.putChild(bundle.family.id, stored);
    expect((await f.mom.get('/family')).body.children[1]).toEqual({...f.leo, dailyBaseMin: 30});
  });

  it('edits a kid without touching the balance', async () => {
    const f = await family();
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
    const res = await f.mom.patch(`/children/${f.mia.id}`, {name: 'Mia-Liis', age: 6, games: {topics: ['numbers'], dailyCapMarbles: 2}});
    expect(res.body).toMatchObject({name: 'Mia-Liis', age: 6, balanceSec: 600, games: {topics: ['numbers'], dailyCapMarbles: 2}});
    expect((await f.mom.patch('/children/nobody', {age: 4})).status).toBe(404);
  });

  it('removes a kid and everything about them; jobs lose the kid, and a job left with nobody goes', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.teeth.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    await f.claim(f.mia.id, f.toys.id);
    await f.tv.post('/device/games/results', {id: randomUUID(), childId: f.mia.id, topic: 'numbers', correct: 3, total: 3, at: f.clock.now});
    expect((await f.mom.delete(`/children/${f.mia.id}`)).status).toBe(204);
    expect((await f.mom.delete(`/children/${f.mia.id}`)).status).toBe(204);

    const {body: bundle} = await f.mom.get('/family');
    expect(bundle.children.map((c: {id: string}) => c.id)).toEqual([f.leo.id]);
    expect(bundle.chores).toEqual([{...f.teeth, childIds: [f.leo.id]}]);
    expect((await f.mom.get('/claims')).body.claims).toEqual([]);
    expect(await f.repo.entries(bundle.family.id, f.mia.id, 50)).toEqual([]);
    expect(await f.repo.pendingEntries(bundle.family.id, f.mia.id)).toEqual([]);
    expect((await f.mom.get(`/children/${f.mia.id}/ledger`)).status).toBe(404);
  });
});

describe('jobs', () => {
  it('picks the icon and a card colour when the parent leaves them out; repeats daily by default', async () => {
    const f = await family();
    expect(f.toys).toMatchObject({title: 'Toys away', icon: 'toys', color: 'peach', minutes: 10, repeat: {kind: 'daily'}, childIds: [f.mia.id]});
    expect(f.teeth).toMatchObject({icon: 'tooth', color: 'mint'});
    const {body: dishes} = await f.mom.post('/chores', {title: 'Tühjenda nõudepesumasin', minutes: 15, childIds: [f.leo.id, f.leo.id]});
    expect(dishes).toMatchObject({icon: 'table', color: 'sky', childIds: [f.leo.id]});
    const {body: own} = await f.mom.post('/chores', {title: 'Something', icon: 'heart', color: 'gold', minutes: 120, childIds: [f.leo.id], repeat: {kind: 'weekdays', days: [5, 1]}});
    expect(own).toMatchObject({icon: 'heart', color: 'gold', repeat: {kind: 'weekdays', days: [1, 5]}});
  });

  it('edits only what is given, and refuses kids from elsewhere', async () => {
    const f = await family();
    const res = await f.mom.patch(`/chores/${f.toys.id}`, {minutes: 15, repeat: {kind: 'once'}});
    expect(res.body).toEqual({...f.toys, minutes: 15, repeat: {kind: 'once'}});
    const stranger = await f.mom.patch(`/chores/${f.toys.id}`, {childIds: ['someone-else']});
    expect(stranger.status).toBe(400);
    expect(stranger.body.error.message).toContain('someone-else');
    expect((await f.mom.patch('/chores/nothing', {minutes: 5})).status).toBe(404);
    expect((await f.mom.delete(`/chores/${f.toys.id}`)).status).toBe(204);
    expect((await f.mom.get('/family')).body.chores).toEqual([f.teeth]);
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
