import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {CHANGED, isPing} from '../src/domain/realtime';
import {family, HOUR, pairTv, textReply} from './helpers';
import {wav} from './wav';

type Fixture = Awaited<ReturnType<typeof family>>;

/** A family with a TV and a parent listening, plus another family's parent who must hear nothing. */
async function listening() {
  const f = await family();
  const {body: bundle} = await f.mom.get('/family');
  const familyId: string = bundle.family.id;
  const {token} = await pairTv(f, f.mom, 'Kitchen'); // a second TV, whose token we know
  f.realtime.splice(0);
  const tvConn = (await f.openRealtime({device: token}))!;
  const momConn = (await f.openRealtime({token: 'jwt-mom'}))!;
  const dad = f.parent('dad');
  await dad.post('/family', {name: 'Other', lang: 'en', timezone: 'UTC', pin: '1111'});
  const stranger = (await f.openRealtime({token: 'jwt-dad'}))!;
  f.realtime.splice(0);
  /** Messages sent since the last call, as "connection: message". */
  const heard = () => f.realtime.splice(0).map(({connectionId, message}) => `${connectionId}: ${message}`).sort();
  return {...f, familyId, tvConn, momConn, stranger, heard};
}

describe('who may open a realtime connection', () => {
  it('lets a paired TV in by its device token, and a parent by a valid Cognito token', async () => {
    const f = await listening();
    const connections = await f.repo.familyConnections(f.familyId, f.clock.now);
    expect(connections.map(c => [c.id, c.kind]).sort()).toEqual([[f.momConn, 'parent'], [f.tvConn, 'tv']].sort());
    expect(connections[0].expiresAt).toBe(f.clock.now + 3 * HOUR);
  });

  it('refuses bad tokens, a parent without a family, a removed TV, and no credentials at all', async () => {
    const f = await family();
    expect(await f.openRealtime({device: 'not-a-token'})).toBeUndefined();
    expect(await f.openRealtime({token: 'garbage'})).toBeUndefined();
    expect(await f.openRealtime({token: 'jwt-nobody'})).toBeUndefined(); // a valid token, but no family yet
    expect(await f.openRealtime({})).toBeUndefined();
    const {token, deviceId} = await pairTv(f, f.mom, 'Old TV');
    await f.mom.delete(`/devices/${deviceId}`);
    expect(await f.openRealtime({device: token})).toBeUndefined();
  });

  it('forgets a connection on $disconnect, and expired ones on its own', async () => {
    const f = await listening();
    await f.repo.removeConnection(f.tvConn);
    expect((await f.repo.familyConnections(f.familyId, f.clock.now)).map(c => c.id)).toEqual([f.momConn]);
    expect(await f.repo.familyConnections(f.familyId, f.clock.now + 3 * HOUR)).toEqual([]);
  });

  it('answers ping with pong and ignores everything else', () => {
    expect(isPing('{"type":"ping"}')).toBe(true);
    expect(isPing('{"type":"hello"}')).toBe(false);
    expect(isPing('ping')).toBe(false);
    expect(isPing(undefined)).toBe(false);
  });
});

describe('telling a family that something changed', () => {
  const writes: [string, (f: Fixture) => Promise<unknown>][] = [
    ['a claim on the TV', f => f.claim(f.mia.id, f.toys.id)],
    ['an approval', async f => {
      const {body: claim} = await f.claim(f.mia.id, f.toys.id);
      f.realtime.splice(0);
      return f.mom.post(`/claims/${claim.id}/approve`);
    }],
    ['a rejection on the TV with the PIN', async f => {
      const {body: claim} = await f.claim(f.mia.id, f.toys.id);
      f.realtime.splice(0);
      return f.tv.post(`/device/claims/${claim.id}/decide`, {yes: false, pin: '1234'});
    }],
    ['"Oops!"', async f => {
      const {body: claim} = await f.claim(f.mia.id, f.toys.id);
      f.realtime.splice(0);
      return f.tv.delete(`/device/claims/${claim.id}`);
    }],
    ['a bonus', f => f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'})],
    ['an approval that earns a character token (the jar is full)', async f => {
      await f.mom.patch(`/children/${f.mia.id}`, {dailyBaseMin: 60});
      const {body: claim} = await f.claim(f.mia.id, f.toys.id);
      f.realtime.splice(0);
      return f.mom.post(`/claims/${claim.id}/approve`);
    }],
    ['a routine job praised', async f => {
      await f.mom.patch(`/chores/${f.toys.id}`, {routine: true});
      const {body: claim} = await f.claim(f.mia.id, f.toys.id);
      f.realtime.splice(0);
      return f.mom.post(`/claims/${claim.id}/approve`);
    }],
    ['a new character (drawing)', async f => {
      await f.giveTokens(f.mia.id, 1);
      return f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a cloud that makes rainbows'});
    }],
    ['a character ready', async f => {
      await f.giveTokens(f.mia.id, 1);
      await f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a cloud that makes rainbows'});
      f.realtime.splice(0);
      return f.runDrawing();
    }],
    ['a character that needs help', async f => {
      await f.giveTokens(f.mia.id, 1);
      await f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a cloud that makes rainbows'});
      f.artist.text$.push(...[1, 2, 3].map(() => textReply('no svg here')));
      f.realtime.splice(0);
      return f.runDrawing();
    }],
    ['a character removed', async f => {
      await f.giveTokens(f.mia.id, 1);
      const {body: character} = await f.mom.post(`/children/${f.mia.id}/characters`, {description: 'a cloud that makes rainbows'});
      f.realtime.splice(0);
      return f.mom.delete(`/children/${f.mia.id}/characters/${character.id}`);
    }],
    ["a parent's name (shown on approvals)", f => f.mom.patch('/me', {name: 'Mom'})],
    ['a hand-off', async f => {
      await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
      const {body} = await f.mom.get(`/children/${f.mia.id}/handoff`);
      f.realtime.splice(0);
      return f.mom.post(`/children/${f.mia.id}/handoff`, {entryIds: body.entries.map((e: {id: string}) => e.id), status: 'DONE'});
    }],
    ['TV settings', f => f.tv.post('/device/settings', {pin: '1234', caps: true})],
    ['family settings', f => f.mom.patch('/family', {voice: false})],
    ['a new kid', f => f.mom.post('/children', {name: 'Ann', avatar: 'bunny', color: 'mint', age: 4})],
    ['a kid edited', f => f.mom.patch(`/children/${f.leo.id}`, {dailyBaseMin: 40})],
    ['a kid removed', f => f.mom.delete(`/children/${f.leo.id}`)],
    ['a new job', f => f.mom.post('/chores', {title: 'Water the plants', minutes: 10, childIds: [f.leo.id]})],
    ['a job edited', f => f.mom.patch(`/chores/${f.toys.id}`, {minutes: 20})],
    ['a job removed', f => f.mom.delete(`/chores/${f.toys.id}`)],
    ['a TV renamed', f => f.mom.patch(`/devices/${f.deviceId}`, {name: 'Den'})],
    ['a TV removed', f => f.mom.delete(`/devices/${f.deviceId}`)],
    ['a TV paired', f => pairTv(f, f.mom, 'Bedroom')],
  ];

  it.each(writes)('after %s: one message to each of the family\'s connections, none to others', async (_, write) => {
    const f = await listening();
    await write(f);
    expect(f.heard()).toEqual([`${f.momConn}: ${CHANGED}`, `${f.tvConn}: ${CHANGED}`].sort());
  });

  it('says nothing after failed writes, repeats that change nothing, or reads', async () => {
    const f = await listening();
    const id = randomUUID();
    await f.claim(f.mia.id, f.toys.id, f.clock.now, id);
    const {body: claim} = await f.mom.post(`/claims/${id}/approve`);
    f.heard();
    await f.claim(f.mia.id, f.toys.id, f.clock.now, id); // the same claim again: 200, nothing new
    await f.claim(f.mia.id, f.toys.id); // already done today: 409
    await f.mom.post(`/claims/${claim.id}/approve`); // approved already: same answer
    await f.mom.post(`/claims/${claim.id}/reject`); // 409
    await f.tv.post(`/device/claims/${claim.id}/decide`, {yes: true, pin: '0000'}); // wrong PIN
    await f.mom.post('/children', {name: 'x'.repeat(30), avatar: 'bear', color: 'mint', age: 5}); // 400
    await f.mom.post(`/children/${f.leo.id}/adjust`, {deltaMin: -10, reason: 'nothing to take'}); // empty jar
    await f.mom.post(`/children/${f.leo.id}/characters`, {description: 'a robot'}); // no token
    await f.mom.patch('/me', {name: 'Mom'});
    f.heard();
    await f.mom.patch('/me', {name: 'Mom'}); // the same name again
    await f.tv.post('/device/speech', {text: 'You did it!', lang: 'en'}); // a new line by the narrator: made, but nothing a family sees
    await f.mom.post('/speech-to-text', wav(16000));
    await f.tv.get('/device/state');
    await f.mom.get('/family');
    expect(f.heard()).toEqual([]);
  });

  it('sends one message per connection even when a request changes many things', async () => {
    const f = await listening();
    const {body: garage} = await f.mom.post('/chores', {title: 'Garage', minutes: 30, childIds: [f.mia.id], repeat: {kind: 'once'}});
    const {body: claim} = await f.claim(f.mia.id, garage.id);
    f.heard();
    await f.mom.post(`/claims/${claim.id}/approve`); // the claim, the ledger, the balance and the job all change
    expect(f.heard()).toEqual([`${f.momConn}: ${CHANGED}`, `${f.tvConn}: ${CHANGED}`].sort());
  });

  it('forgets connections that are gone (410) and still tells the rest', async () => {
    const f = await listening();
    f.goneConnections.add(f.tvConn);
    await f.mom.post(`/children/${f.mia.id}/adjust`, {deltaMin: 10, reason: 'Kind'});
    expect(f.heard()).toEqual([`${f.momConn}: ${CHANGED}`]);
    expect((await f.repo.familyConnections(f.familyId, f.clock.now)).map(c => c.id)).toEqual([f.momConn]);
  });
});
