import {describe, expect, it} from 'vitest';
import {MemoryRepo} from '../src/repo/memory';
import {DEMO_PARENT, seedDemo} from '../src/seed';
import {MONDAY_NOON} from './helpers';

describe("the dev server's data file", () => {
  it('brings a family back as it was', async () => {
    const before = new MemoryRepo();
    await seedDemo(before, MONDAY_NOON);
    const familyId = (await before.familyIdOf(DEMO_PARENT))!;
    await before.putPushSubscription(familyId, {endpoint: 'https://push.test/1', keys: {p256dh: 'p', auth: 'a'}, sub: DEMO_PARENT, createdAt: MONDAY_NOON});

    const after = new MemoryRepo();
    after.restore(before.snapshot());
    expect(await after.familyIdOf(DEMO_PARENT)).toBe(familyId);
    expect(await after.getFamily(familyId)).toEqual(await before.getFamily(familyId));
    expect(await after.listChildren(familyId)).toEqual(await before.listChildren(familyId));
    expect(await after.pushSubscriptions(familyId)).toEqual(await before.pushSubscriptions(familyId));
    expect(after.snapshot().equals(before.snapshot())).toBe(true);
  });

  it('leaves realtime connections behind: they belonged to the old process', async () => {
    const before = new MemoryRepo();
    await seedDemo(before, MONDAY_NOON);
    const familyId = (await before.familyIdOf(DEMO_PARENT))!;
    await before.addConnection({id: 'c1', familyId, kind: 'parent', connectedAt: MONDAY_NOON, expiresAt: MONDAY_NOON + 1000});
    expect(await before.familyConnections(familyId, MONDAY_NOON)).toHaveLength(1);
    const after = new MemoryRepo();
    after.restore(before.snapshot());
    expect(await after.familyConnections(familyId, MONDAY_NOON)).toEqual([]);
  });

  it('refuses a file that is something else', () => {
    expect(() => new MemoryRepo().restore(Buffer.from('hello'))).toThrow();
  });
});
