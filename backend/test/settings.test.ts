import {describe, expect, it} from 'vitest';
import {family, MINUTE, pairTv} from './helpers';

describe('TV settings, changed on the TV with the family PIN', () => {
  it('changes language, CAPITAL LETTERS and read-aloud, one at a time or together, and returns the family', async () => {
    const f = await family();
    const lang = await f.tv.post('/device/settings', {pin: '1234', lang: 'et'});
    expect(lang.status).toBe(200);
    expect(lang.body).toMatchObject({name: 'Test family', lang: 'et', caps: false, voice: true, hasPin: true});
    expect((await f.tv.post('/device/settings', {pin: '1234', caps: true})).body).toMatchObject({lang: 'et', caps: true, voice: true});
    expect((await f.tv.post('/device/settings', {pin: '1234', voice: false})).body).toMatchObject({lang: 'et', caps: true, voice: false});
    const all = await f.tv.post('/device/settings', {pin: '1234', lang: 'es', caps: false, voice: true});
    expect(all.body).toMatchObject({lang: 'es', caps: false, voice: true});
    // The parent app sees it on its next load.
    expect((await f.mom.get('/family')).body.family).toEqual(all.body);
  });

  it('gives every TV of the family a new ETag', async () => {
    const f = await family();
    const {tv: kitchen} = await pairTv(f, f.mom, 'Kitchen');
    const before = await kitchen.get('/device/state');
    await f.tv.post('/device/settings', {pin: '1234', caps: true});
    const after = await kitchen.get('/device/state', {'if-none-match': before.headers.etag});
    expect(after.status).toBe(200);
    expect(after.body.family.caps).toBe(true);
  });

  it('keeps a change made in the parent app at the same time', async () => {
    const f = await family();
    await Promise.all([f.mom.patch('/family', {name: 'Renamed'}), f.tv.post('/device/settings', {pin: '1234', lang: 'de'})]);
    expect((await f.mom.get('/family')).body.family).toMatchObject({name: 'Renamed', lang: 'de'});
  });

  it('needs the PIN and at least one setting (400, nothing changes)', async () => {
    const f = await family();
    for (const body of [{pin: '1234'}, {lang: 'de'}, {pin: '1234', lang: 'fr'}, {pin: '12345', caps: true}, {pin: '1234', voice: 'no'}]) {
      const res = await f.tv.post('/device/settings', body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid');
    }
    expect((await f.tv.post('/device/settings', {pin: '1234'})).body.error.message).toBe('body must change at least one of lang, caps, voice');
    expect((await f.mom.get('/family')).body.family).toMatchObject({lang: 'en', caps: false, voice: true});
  });

  it('refuses a wrong PIN with 403 wrong_pin and changes nothing', async () => {
    const f = await family();
    const res = await f.tv.post('/device/settings', {pin: '4321', lang: 'de'});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('wrong_pin');
    expect((await f.mom.get('/family')).body.family.lang).toBe('en');
  });

  it('shares the wrong-PIN limit with decisions on the same TV', async () => {
    const f = await family();
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    for (let i = 0; i < 3; i++) await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '0000'});
    for (let i = 0; i < 2; i++) expect((await f.tv.post('/device/settings', {pin: '0000', caps: true})).status).toBe(403);
    const blocked = await f.tv.post('/device/settings', {pin: '1234', caps: true});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_tries');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '1234'})).status).toBe(429);
    f.clock.now += MINUTE;
    expect((await f.tv.post('/device/settings', {pin: '1234', caps: true})).body.caps).toBe(true);
  });

  it('answers 403 no_pin when the family has no PIN', async () => {
    const f = await family();
    const {body: bundle} = await f.mom.get('/family');
    await f.repo.updateFamily(bundle.family.id, {pin: null});
    const res = await f.tv.post('/device/settings', {pin: '1234', voice: false});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('no_pin');
  });

  it("only ever changes the TV's own family", async () => {
    const f = await family();
    const dad = f.parent('dad');
    await dad.post('/family', {name: 'Other family', lang: 'en', timezone: 'UTC', pin: '9999'});
    const {tv: theirs} = await pairTv(f, dad, 'Their TV');
    expect((await theirs.post('/device/settings', {pin: '1234', lang: 'de'})).body.error.code).toBe('wrong_pin');
    expect((await theirs.post('/device/settings', {pin: '9999', lang: 'de'})).body).toMatchObject({name: 'Other family', lang: 'de'});
    expect((await f.mom.get('/family')).body.family.lang).toBe('en');
    expect((await f.open.post('/device/settings', {pin: '1234', lang: 'de'})).status).toBe(401);
  });
});
