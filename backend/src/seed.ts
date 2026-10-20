/** The demo family for the dev server (`npm run dev -- --seed`): the sample family the TV app shows offline. */
import type {Repo} from './domain/repo';
import {hashPin, newPairingCode, sha256Hex} from './domain/secrets';
import type {Chore, Child} from './domain/types';

export const DEMO_PARENT = 'dev-demo';
/** A TV token that only works on the dev server (in memory), so the TV app can skip pairing while you work on it. */
export const DEMO_DEVICE_TOKEN = 'dev-tv';

type Job = [id: string, title: string, icon: Chore['icon'], color: Chore['color'], minutes: number, childIds: string[]];

export async function seedDemo(repo: Repo, now: number): Promise<void> {
  const familyId = 'demo';
  await repo.createFamily(
    {id: familyId, name: 'Demo family', lang: 'en', timezone: 'Europe/Tallinn', caps: false, voice: true, pin: hashPin('1234'), createdAt: now},
    {sub: DEMO_PARENT, email: 'demo@dev.local'},
  );

  // Mia's jar holds 60 minutes (30 given every day, 30 to earn), Leo's 90 (50 given, 40 to earn); Mia has a
  // character token to spend.
  const kids: [Child, number][] = [
    [{id: 'mia', name: 'Mia', avatar: 'bear', color: 'gold', age: 5, dailyMaxMin: 60, dailyBaseMin: 30, characterTokens: 1, createdAt: now, balanceSec: 0, debtSec: 0}, 20],
    [{id: 'leo', name: 'Leo', avatar: 'bunny', color: 'sky', age: 8, dailyMaxMin: 90, dailyBaseMin: 50, characterTokens: 0, createdAt: now + 1, balanceSec: 0, debtSec: 0}, 20],
  ];
  for (const [child, minutes] of kids) {
    await repo.putChild(familyId, child);
    // The starting balance goes through the ledger like any other time; it isn't for the Amazon Kids hand-off.
    await repo.addEntry(familyId, {
      id: `start-${child.id}`, childId: child.id, deltaSec: minutes * 60, type: 'ADJUST', reason: 'Starting balance', createdBy: 'system', createdAt: now,
    });
  }

  // The sample jobs in tv/packages/shared/src/marble/data.ts, in the TV's order, in whole marbles (10–30 minutes).
  // A job both kids do is one job.
  const jobs: Job[] = [
    ['toys', 'Toys away', 'toys', 'peach', 10, ['mia']],
    ['cat', 'Feed the cat', 'cat', 'mint', 10, ['mia']],
    ['table', 'Set the table', 'table', 'peach', 20, ['leo']],
    ['teeth', 'Brush teeth', 'tooth', 'sky', 10, ['mia', 'leo']],
    ['pajamas', 'Pajamas on', 'moon', 'lilac', 10, ['mia', 'leo']],
  ];
  for (const [i, [id, title, icon, color, minutes, childIds]] of jobs.entries()) {
    await repo.putChore(familyId, {id, title, icon, color, minutes, routine: false, repeat: {kind: 'daily'}, childIds, createdAt: now + i, updatedAt: now + i});
  }

  // A TV paired the normal way, except that its token is known.
  const code = newPairingCode();
  await repo.createPairing({code, platform: 'fireos', status: 'waiting', createdAt: now, expiresAt: now + 60_000});
  await repo.confirmPairing(code, {id: 'living-room', familyId, name: 'Living room TV', platform: 'fireos', mode: 'amazon_kids', createdAt: now}, now);
  await repo.issueToken(code, familyId, 'living-room', sha256Hex(DEMO_DEVICE_TOKEN));
}
