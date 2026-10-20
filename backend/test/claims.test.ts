import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {DAY, family, HOUR, MINUTE, MONDAY_NOON, pairTv} from './helpers';

describe('claims', () => {
  it('creates a claim once; a resend (same id) gets the same claim', async () => {
    const f = await family();
    const id = randomUUID();
    const first = await f.claim(f.mia.id, f.toys.id, f.clock.now, id);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id, childId: f.mia.id, choreId: f.toys.id, choreTitle: 'Toys away', status: 'waiting', minutes: 10, createdAt: MONDAY_NOON,
      promised: {reward: 'marbles', minutes: 10},
    });
    f.clock.now += MINUTE;
    const again = await f.claim(f.mia.id, f.toys.id, f.clock.now, id);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect((await f.mom.get('/claims?status=waiting')).body.claims).toEqual([first.body]);
  });

  it('approves exactly once: the minutes go to the kid once, a repeat returns the same claim', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    f.clock.now += MINUTE;
    const approved = await f.mom.post(`/claims/${claim.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({status: 'approved', decidedBy: 'parent', decidedAt: f.clock.now});
    expect(await f.balance(f.mia.id)).toBe(600);

    const repeat = await f.mom.post(`/claims/${claim.id}/approve`);
    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual(approved.body);
    expect(await f.balance(f.mia.id)).toBe(600);

    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries).toEqual([expect.objectContaining({
      childId: f.mia.id, deltaSec: 600, type: 'CHORE', reason: 'Toys away', refId: claim.id, createdBy: 'parent:mom', handoff: 'PENDING',
    })]);
  });

  it('answers the opposite decision with 409', async () => {
    const f = await family();
    const {body: one} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${one.id}/approve`);
    expect((await f.mom.post(`/claims/${one.id}/reject`)).body.error.code).toBe('already_decided');

    const {body: two} = await f.claim(f.leo.id, f.teeth.id);
    await f.mom.post(`/claims/${two.id}/reject`);
    const late = await f.mom.post(`/claims/${two.id}/approve`);
    expect(late.status).toBe(409);
    expect(await f.balance(f.leo.id)).toBe(0);
    expect((await f.mom.post('/claims/nope/approve')).status).toBe(404);
  });

  it('keeps the reason a grown-up gives with "not yet", from the phone or the TV, and tells the TV', async () => {
    const f = await family();
    const {body: one} = await f.claim(f.mia.id, f.toys.id);
    const phone = await f.mom.post(`/claims/${one.id}/reject`, {reason: 'not_finished'});
    expect(phone.body).toMatchObject({status: 'rejected', notYetReason: 'not_finished'});
    const {body: two} = await f.claim(f.leo.id, f.teeth.id);
    const tv = await f.tv.post(`/device/claims/${two.id}/decide`, {yes: false, pin: '1234', reason: 'together'});
    expect(tv.body).toMatchObject({status: 'rejected', notYetReason: 'together'});
    const {body: state} = await f.tv.get('/device/state');
    expect(state.claims.map((c: {id: string; notYetReason?: string}) => [c.id, c.notYetReason]).sort()).toEqual([[one.id, 'not_finished'], [two.id, 'together']].sort());
    // A reason is optional, and only the known ones are taken; a yes never carries one.
    const {body: three} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.mom.post(`/claims/${three.id}/reject`, {reason: 'lazy'})).status).toBe(400);
    expect((await f.mom.post(`/claims/${three.id}/reject`)).body.notYetReason).toBeUndefined();
    const {body: four} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.tv.post(`/device/claims/${four.id}/decide`, {yes: true, pin: '1234', reason: 'later'})).body.notYetReason).toBeUndefined();
  });

  it('allows a job once per day: a waiting or approved claim holds the day, a rejected one frees it', async () => {
    const f = await family();
    const {body: first} = await f.claim(f.mia.id, f.toys.id);
    const twice = await f.claim(f.mia.id, f.toys.id);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('already_claimed');

    await f.mom.post(`/claims/${first.id}/reject`);
    const {body: second} = await f.claim(f.mia.id, f.toys.id);
    expect(second.status).toBe('waiting');
    await f.mom.post(`/claims/${second.id}/approve`);
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(409);
    // Another kid, or another job, is another slot.
    expect((await f.claim(f.leo.id, f.teeth.id)).status).toBe(201);
    expect((await f.claim(f.mia.id, f.teeth.id)).status).toBe(201);
  });

  it("counts days in the family's time zone, not UTC", async () => {
    // 23:30 in Tallinn on Monday is 20:30 UTC; 00:10 on Tuesday in Tallinn is still Monday (21:10) in UTC.
    const f = await family(Date.UTC(2026, 9, 5, 20, 30));
    const {body: late} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${late.id}/approve`);
    f.clock.now = Date.UTC(2026, 9, 5, 20, 50);
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(409);
    f.clock.now = Date.UTC(2026, 9, 5, 21, 10);
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(201);
  });

  it("uses the kid's own claim time when the TV uploads late", async () => {
    const f = await family(Date.UTC(2026, 9, 5, 21, 10)); // Tuesday 00:10 in Tallinn
    const offline = await f.claim(f.mia.id, f.toys.id, Date.UTC(2026, 9, 5, 20, 55)); // Monday 23:55
    expect(offline.body.createdAt).toBe(Date.UTC(2026, 9, 5, 20, 55));
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(201); // Tuesday's slot is free
    // A clock far off (or in the future) is replaced by the server's time.
    const {body: odd} = await f.claim(f.leo.id, f.teeth.id, f.clock.now + HOUR);
    expect(odd.createdAt).toBe(f.clock.now);
  });

  it('lets the kid take back a waiting claim ("Oops!"), but not a decided one', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    expect((await f.tv.delete(`/device/claims/${claim.id}`)).status).toBe(204);
    expect((await f.tv.delete(`/device/claims/${claim.id}`)).status).toBe(204);
    expect((await f.mom.get('/claims')).body.claims).toEqual([]);

    const {body: again} = await f.claim(f.mia.id, f.toys.id);
    expect(again.status).toBe('waiting');
    await f.mom.post(`/claims/${again.id}/approve`);
    const late = await f.tv.delete(`/device/claims/${again.id}`);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('already_decided');
  });

  it('puts weekday jobs on the board only on their days (ISO weekdays, family time zone)', async () => {
    const f = await family();
    const {body: swim} = await f.mom.post('/chores', {title: 'Swim bag', minutes: 10, childIds: [f.leo.id], repeat: {kind: 'weekdays', days: [3, 5]}});
    const monday = await f.claim(f.leo.id, swim.id);
    expect(monday.status).toBe(409);
    expect(monday.body.error.code).toBe('not_today');
    // Tuesday 21:30 UTC is Wednesday 00:30 in Tallinn.
    f.clock.now = Date.UTC(2026, 9, 6, 21, 30);
    expect((await f.claim(f.leo.id, swim.id)).status).toBe(201);
  });

  it('takes a kid off a one-off job once approved; the job goes when nobody is left', async () => {
    const f = await family();
    const {body: garage} = await f.mom.post('/chores', {title: 'Clean the garage', minutes: 30, childIds: [f.mia.id, f.leo.id], repeat: {kind: 'once'}});
    const {body: mias} = await f.claim(f.mia.id, garage.id);
    // While it waits, the same kid can't claim it again, even on another day.
    f.clock.now += DAY;
    expect((await f.claim(f.mia.id, garage.id)).body.error.code).toBe('already_claimed');
    await f.mom.post(`/claims/${mias.id}/approve`);
    expect(await f.balance(f.mia.id)).toBe(1800);

    let {body: bundle} = await f.mom.get('/family');
    expect(bundle.chores.find((k: {id: string}) => k.id === garage.id).childIds).toEqual([f.leo.id]);
    expect((await f.claim(f.mia.id, garage.id)).body.error.code).toBe('not_on_board');

    const {body: leos} = await f.claim(f.leo.id, garage.id);
    await f.mom.post(`/claims/${leos.id}/approve`);
    ({body: bundle} = await f.mom.get('/family'));
    expect(bundle.chores.map((k: {id: string}) => k.id)).not.toContain(garage.id);
    // History keeps the job's title.
    expect((await f.mom.get('/claims?status=approved')).body.claims.map((c: {choreTitle: string}) => c.choreTitle)).toEqual(['Clean the garage', 'Clean the garage']);
  });

  it('approves two kids on the same one-off job at the same moment', async () => {
    const f = await family();
    const {body: garage} = await f.mom.post('/chores', {title: 'Garage', minutes: 30, childIds: [f.mia.id, f.leo.id], repeat: {kind: 'once'}});
    const {body: a} = await f.claim(f.mia.id, garage.id);
    const {body: b} = await f.claim(f.leo.id, garage.id);
    const results = await Promise.all([f.mom.post(`/claims/${a.id}/approve`), f.mom.post(`/claims/${b.id}/approve`)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect([await f.balance(f.mia.id), await f.balance(f.leo.id)]).toEqual([1800, 1800]);
    expect((await f.mom.get('/family')).body.chores.map((k: {id: string}) => k.id)).not.toContain(garage.id);
  });

  it('keeps the title and minutes from claim time, and survives the job being deleted', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.patch(`/chores/${f.toys.id}`, {title: 'Tidy up', minutes: 20});
    await f.mom.delete(`/chores/${f.toys.id}`);
    const {body: approved} = await f.mom.post(`/claims/${claim.id}/approve`);
    expect(approved).toMatchObject({choreTitle: 'Toys away', minutes: 10, status: 'approved'});
    expect(await f.balance(f.mia.id)).toBe(600);
  });

  it('refuses claims for unknown kids or jobs, and jobs not on the kid\'s board', async () => {
    const f = await family();
    expect((await f.claim('nobody', f.toys.id)).status).toBe(404);
    expect((await f.claim(f.mia.id, 'nothing')).status).toBe(404);
    const notTheirs = await f.claim(f.leo.id, f.toys.id);
    expect(notTheirs.status).toBe(409);
    expect(notTheirs.body.error.code).toBe('not_on_board');
  });

  it('creates one claim when the same id arrives twice at once', async () => {
    const f = await family();
    const id = randomUUID();
    const results = await Promise.all([f.claim(f.mia.id, f.toys.id, f.clock.now, id), f.claim(f.mia.id, f.toys.id, f.clock.now, id)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 201]);
    expect((await f.mom.get('/claims')).body.claims).toHaveLength(1);
  });

  it('lists claims newest first, filtered by status', async () => {
    const f = await family();
    const {body: a} = await f.claim(f.mia.id, f.toys.id);
    f.clock.now += MINUTE;
    const {body: b} = await f.claim(f.leo.id, f.teeth.id);
    f.clock.now += MINUTE;
    const {body: c} = await f.claim(f.mia.id, f.teeth.id);
    await f.mom.post(`/claims/${a.id}/approve`);
    await f.mom.post(`/claims/${c.id}/reject`);
    expect((await f.mom.get('/claims')).body.claims.map((x: {id: string}) => x.id)).toEqual([c.id, b.id, a.id]);
    expect((await f.mom.get('/claims?status=waiting')).body.claims.map((x: {id: string}) => x.id)).toEqual([b.id]);
    expect((await f.mom.get('/claims?status=rejected')).body.claims.map((x: {id: string}) => x.id)).toEqual([c.id]);
  });
});

describe('deciding on the TV', () => {
  it('approves with the family PIN; decidedBy is "tv"', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const res = await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'approved', decidedBy: 'tv'});
    const {body: ledger} = await f.mom.get(`/children/${f.mia.id}/ledger`);
    expect(ledger.entries[0].createdBy).toBe(`tv:${f.deviceId}`);
    // Saying yes again (e.g. the TV's outbox resends) changes nothing.
    expect((await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'})).body).toEqual(res.body);
    expect(await f.balance(f.mia.id)).toBe(600);
  });

  it('says "not yet" too, which frees the day', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    const res = await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: false, pin: '1234'});
    expect(res.body).toMatchObject({status: 'rejected', decidedBy: 'tv'});
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(201);
  });

  it('allows 5 wrong PINs a minute per TV, then answers 429 (even to the right PIN) until the minute is over', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    for (let i = 0; i < 5; i++) {
      const wrong = await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '0000'});
      expect(wrong.status).toBe(403);
      expect(wrong.body.error.code).toBe('wrong_pin');
      f.clock.now += 1000;
    }
    const blocked = await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'});
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Another TV in the family isn't blocked.
    const {tv: other} = await pairTv(f, f.mom, 'Kitchen');
    expect((await other.post(`/device/claims/${claim.id}/decide`, {yes: false, pin: '0000'})).status).toBe(403);

    f.clock.now += MINUTE;
    const ok = await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'});
    expect(ok.status).toBe(200);
    expect(await f.balance(f.mia.id)).toBe(600);
  });
});
