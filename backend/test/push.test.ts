import {randomUUID} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {claimNotice} from '../src/domain/push';
import type {PushSubscription} from '../src/domain/types';
import {webPushSender} from '../src/push/web-push';
import {family, setup} from './helpers';

const browser = (name: string) => ({endpoint: `https://push.example.com/send/${name}`, keys: {p256dh: `BP${name}key`, auth: `auth${name}`}});

describe('push subscriptions', () => {
  it('hands out the public key to anyone', async () => {
    const t = await setup();
    expect((await t.open.get('/push/key')).body).toEqual({publicKey: 'test-vapid-public-key'});
  });

  it('saves a browser once (a repeat updates it) and forgets it on request', async () => {
    const f = await family();
    const familyId = (await f.mom.get('/family')).body.family.id;
    expect((await f.mom.post('/push/subscriptions', browser('phone'))).status).toBe(201);
    expect((await f.mom.post('/push/subscriptions', {...browser('phone'), keys: {p256dh: 'BPnewkey', auth: 'authnew'}})).status).toBe(201);
    expect(await f.repo.pushSubscriptions(familyId)).toEqual([{...browser('phone'), keys: {p256dh: 'BPnewkey', auth: 'authnew'}, sub: 'mom', createdAt: f.clock.now}]);
    await f.mom.post('/push/subscriptions', browser('laptop'));
    expect((await f.mom.delete('/push/subscriptions')).status).toBe(400); // which browser?
    expect((await f.mom.delete('/push/subscriptions', {endpoint: browser('phone').endpoint})).status).toBe(204);
    expect((await f.mom.delete('/push/subscriptions', {endpoint: browser('phone').endpoint})).status).toBe(204);
    expect((await f.repo.pushSubscriptions(familyId)).map(s => s.endpoint)).toEqual([browser('laptop').endpoint]);
  });

  it('checks what it saves', async () => {
    const f = await family();
    for (const body of [
      {...browser('a'), endpoint: 'http://push.example.com/x'},
      {...browser('a'), endpoint: `https://push.example.com/${'x'.repeat(1000)}`},
      {endpoint: browser('a').endpoint},
      {...browser('a'), keys: {p256dh: 'has spaces', auth: 'x'}},
    ]) {
      const res = await f.mom.post('/push/subscriptions', body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid');
    }
    expect((await f.parent('newcomer').post('/push/subscriptions', browser('a'))).body.error.code).toBe('no_family');
  });
});

describe('pushes when a kid says "I did it!"', () => {
  it('tells every subscribed browser of the family once, in the family language, with the claim', async () => {
    const f = await family();
    await f.mom.post('/push/subscriptions', browser('phone'));
    // Another family's parent, subscribed too, hears nothing about this family.
    const dad = f.parent('dad');
    await dad.post('/family', {name: 'Other', lang: 'en', timezone: 'UTC', pin: '1111'});
    await dad.post('/push/subscriptions', browser('dads-phone'));
    const id = randomUUID();
    const res = await f.claim(f.mia.id, f.toys.id, f.clock.now, id);
    expect(res.status).toBe(201);
    expect(f.pushes).toEqual([{
      endpoint: browser('phone').endpoint,
      payload: {title: 'Mia: Toys away is done', body: '+10 min · tap to answer', data: {url: '/', claimId: id}},
    }]);
    await f.claim(f.mia.id, f.toys.id, f.clock.now, id); // the TV's outbox resends: no second push
    expect(f.pushes).toHaveLength(1);
  });

  it('writes in the family language', async () => {
    const f = await family();
    await f.mom.patch('/family', {lang: 'et'});
    await f.mom.post('/push/subscriptions', browser('phone'));
    await f.claim(f.mia.id, f.toys.id);
    expect(f.pushes[0].payload).toMatchObject({title: 'Mia: Toys away – tehtud', body: '+10 min · puuduta, et vastata'});
    expect(claimNotice('de', 'Leo', 'Tisch decken', 15)).toEqual({title: 'Leo: Tisch decken – erledigt', body: '+15 Min. · tippen zum Antworten'});
    expect(claimNotice('es', 'Leo', 'Poner la mesa', 15)).toEqual({title: 'Leo: Poner la mesa – hecho', body: '+15 min · toca para responder'});
  });

  it('forgets browsers the push service says are gone (404/410), keeps the rest, and never fails the claim', async () => {
    const f = await family();
    for (const name of ['gone', 'down', 'fine', 'broken']) await f.mom.post('/push/subscriptions', browser(name));
    f.pushAnswers.set(browser('gone').endpoint, 'gone');
    f.pushAnswers.set(browser('down').endpoint, 'failed');
    expect((await f.claim(f.mia.id, f.toys.id)).status).toBe(201);
    const familyId = (await f.mom.get('/family')).body.family.id;
    expect((await f.repo.pushSubscriptions(familyId)).map(s => s.endpoint).sort()).toEqual(['broken', 'down', 'fine'].map(n => browser(n).endpoint).sort());
  });

  it('pushes nothing on decisions or other changes', async () => {
    const f = await family();
    await f.mom.post('/push/subscriptions', browser('phone'));
    const {body: claim} = await f.claim(f.mia.id, f.toys.id);
    await f.mom.post(`/claims/${claim.id}/approve`);
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 5, reason: 'Kind'});
    expect(f.pushes).toHaveLength(1);
  });
});

describe('the Web Push sender', () => {
  const PRIVATE = 'super-secret-private-key-value';
  const keys = async () => ({publicKey: 'public-key', privateKey: PRIVATE});
  const subscription: PushSubscription = {...browser('phone'), sub: 'mom', createdAt: 0};
  afterEach(() => vi.restoreAllMocks());

  it('sends with the VAPID keys, an hour to live and high urgency', async () => {
    const send = vi.fn(async () => ({statusCode: 201, body: '', headers: {}}));
    const sender = webPushSender(keys, 'https://pwa.test', send);
    expect(await sender.send(subscription, '{"title":"x"}')).toBe('sent');
    expect(send).toHaveBeenCalledWith({endpoint: subscription.endpoint, keys: subscription.keys}, '{"title":"x"}', {
      TTL: 3600, urgency: 'high', vapidDetails: {subject: 'https://pwa.test', publicKey: 'public-key', privateKey: PRIVATE},
    });
    expect(await sender.publicKey()).toBe('public-key');
  });

  it('reports gone browsers (404, 410), and logs failures without ever logging the private key', async () => {
    const logged: string[] = [];
    for (const method of ['log', 'error', 'warn', 'info'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args.map(a => (a instanceof Error ? `${a.message} ${a.stack}` : JSON.stringify(a) ?? String(a))).join(' ')));
    }
    const failing = (statusCode: number | undefined) => async () => {
      throw Object.assign(new Error(`push failed, key ${PRIVATE}`), {statusCode, headers: {authorization: `vapid k=${PRIVATE}`}});
    };
    expect(await webPushSender(keys, 'https://pwa.test', failing(410)).send(subscription, '{}')).toBe('gone');
    expect(await webPushSender(keys, 'https://pwa.test', failing(404)).send(subscription, '{}')).toBe('gone');
    expect(await webPushSender(keys, 'https://pwa.test', failing(500)).send(subscription, '{}')).toBe('failed');
    expect(await webPushSender(keys, 'https://pwa.test', failing(undefined)).send(subscription, '{}')).toBe('failed');
    expect(logged).toEqual(['"web push to push.example.com failed (500)"', '"web push to push.example.com failed (no answer)"']);
    expect(logged.join('\n')).not.toContain(PRIVATE);
  });
});
