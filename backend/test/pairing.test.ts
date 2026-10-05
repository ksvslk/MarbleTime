import {describe, expect, it} from 'vitest';
import {family, MINUTE, MONDAY_NOON, setup} from './helpers';

describe('pairing a TV', () => {
  it('gives the TV a 6-character code for 10 minutes and a link to the parent app', async () => {
    const t = await setup();
    const res = await t.open.post('/pairings', {platform: 'vega'});
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(res.body).toEqual({code: res.body.code, expiresAt: MONDAY_NOON + 10 * MINUTE, pairUrl: `https://pwa.test/pair/${res.body.code}`});
    expect((await t.open.get(`/pairings/${res.body.code}`)).body).toEqual({status: 'waiting'});
  });

  it('hands the device token out once, after the parent confirms', async () => {
    const t = await setup();
    const mom = t.parent('mom');
    await mom.post('/family', {name: 'Fam', lang: 'et', timezone: 'Europe/Tallinn', pin: '1234'});
    const {body: {code}} = await t.open.post('/pairings', {platform: 'fireos'});
    const confirmed = await mom.post(`/pairings/${code}/confirm`, {name: 'Living room'});
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toEqual({id: confirmed.body.id, name: 'Living room', platform: 'fireos', mode: 'amazon_kids', createdAt: MONDAY_NOON});

    const first = await t.open.get(`/pairings/${code}`);
    expect(first.body).toEqual({status: 'paired', deviceId: confirmed.body.id, deviceToken: expect.stringMatching(/^[\w-]{43}$/)});
    expect((await t.open.get(`/pairings/${code}`)).body).toEqual({status: 'paired', deviceId: confirmed.body.id});

    const state = await t.device(first.body.deviceToken).get('/device/state');
    expect(state.status).toBe(200);
    expect(state.body.family.lang).toBe('et');
  });

  it('returns the same TV when the same family confirms again; another family gets 409', async () => {
    const t = await setup();
    const mom = t.parent('mom');
    const other = t.parent('other');
    for (const parent of [mom, other]) await parent.post('/family', {name: 'Fam', lang: 'en', timezone: 'UTC', pin: '1111'});
    const {body: {code}} = await t.open.post('/pairings', {platform: 'fireos'});
    const {body: device} = await mom.post(`/pairings/${code}/confirm`, {name: 'TV', mode: 'strict'});
    expect(device.mode).toBe('strict');
    const again = await mom.post(`/pairings/${code}/confirm`, {name: 'TV'});
    expect(again.status).toBe(200);
    expect(again.body).toEqual(device);
    const stranger = await other.post(`/pairings/${code}/confirm`, {name: 'Mine'});
    expect(stranger.status).toBe(409);
    expect(stranger.body.error.code).toBe('already_paired');
  });

  it('expires codes after 10 minutes', async () => {
    const t = await setup();
    const mom = t.parent('mom');
    await mom.post('/family', {name: 'Fam', lang: 'en', timezone: 'UTC', pin: '1111'});
    const {body: {code}} = await t.open.post('/pairings', {platform: 'fireos'});
    t.clock.now += 10 * MINUTE;
    expect((await t.open.get(`/pairings/${code}`)).body.status).toBe('waiting');
    t.clock.now += 1;
    expect((await t.open.get(`/pairings/${code}`)).body).toEqual({status: 'expired'});
    const late = await mom.post(`/pairings/${code}/confirm`, {name: 'TV'});
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe('expired');
  });

  it('accepts a code typed in lower case; 404 for an unknown code, 400 for a malformed one', async () => {
    const t = await setup();
    const mom = t.parent('mom');
    await mom.post('/family', {name: 'Fam', lang: 'en', timezone: 'UTC', pin: '1111'});
    const {body: {code}} = await t.open.post('/pairings', {platform: 'web'});
    expect((await mom.post(`/pairings/${code.toLowerCase()}/confirm`, {name: 'Tablet'})).status).toBe(201);
    const unknown = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    expect((await t.open.get(`/pairings/${unknown}`)).status).toBe(404);
    expect((await mom.post(`/pairings/${unknown}/confirm`, {name: 'TV'})).status).toBe(404);
    expect((await t.open.get('/pairings/AB1O')).status).toBe(400);
  });

  it("stops a TV's token working once the TV is removed", async () => {
    const f = await family();
    expect((await f.tv.get('/device/state')).status).toBe(200);
    expect((await f.mom.delete(`/devices/${f.deviceId}`)).status).toBe(204);
    const res = await f.tv.get('/device/state');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unpaired');
  });

  it('needs "Authorization: Device <token>" on TV routes', async () => {
    const f = await family();
    expect((await f.open.get('/device/state')).status).toBe(401);
    expect((await f.device('not-a-token').get('/device/state')).body.error.code).toBe('unpaired');
    // A parent's credentials are not a TV's.
    expect((await f.mom.post('/device/heartbeat')).status).toBe(401);
  });
});

describe('TVs in the parent app', () => {
  it('shows when each TV was last seen (heartbeats, and requests at most once a minute)', async () => {
    const f = await family();
    let [device] = (await f.mom.get('/devices')).body.devices;
    expect(device.lastSeen).toBeUndefined();
    await f.tv.get('/device/state');
    [device] = (await f.mom.get('/devices')).body.devices;
    expect(device.lastSeen).toBe(MONDAY_NOON);
    f.clock.now += 30_000;
    await f.tv.get('/device/state');
    [device] = (await f.mom.get('/devices')).body.devices;
    expect(device.lastSeen).toBe(MONDAY_NOON);
    expect((await f.tv.post('/device/heartbeat', {appVersion: '1.0.0'})).status).toBe(204);
    [device] = (await f.mom.get('/devices')).body.devices;
    expect(device.lastSeen).toBe(MONDAY_NOON + 30_000);
  });

  it('renames a TV and changes its mode', async () => {
    const f = await family();
    const res = await f.mom.patch(`/devices/${f.deviceId}`, {name: 'Kids room', mode: 'api_mock'});
    expect(res.body).toMatchObject({id: f.deviceId, name: 'Kids room', mode: 'api_mock', platform: 'fireos'});
    expect((await f.mom.patch('/devices/nope', {name: 'X'})).status).toBe(404);
  });
});
