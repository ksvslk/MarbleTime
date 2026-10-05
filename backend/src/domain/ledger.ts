/** The ledger: bonuses and penalties, history, the Amazon Kids hand-off, and brain-game marbles (docs/03 §6, §11). */
import type {Deps} from './deps';
import {busy, conflict, notFound} from './errors';
import {newId} from './secrets';
import {localDay} from './time';
import {type Child, type Device, type Family, type LedgerEntry, MARBLE_SEC, type Parent} from './types';
import type {AdjustInput, GameInput, HandoffInput} from './validate';
import {entryView, newestFirst} from './views';

/** Marbles for one finished brain game (2 = 10 min), before the daily cap. */
export const GAME_MARBLES = 2;

async function requireChild(deps: Deps, familyId: string, childId: string): Promise<Child> {
  const child = await deps.repo.getChild(familyId, childId);
  if (!child) throw notFound('child');
  return child;
}

async function balance(deps: Deps, familyId: string, entry: LedgerEntry) {
  const child = await requireChild(deps, familyId, entry.childId);
  return {balanceSec: child.balanceSec, entry: entryView(entry)};
}

/**
 * Bonus (+) or minutes taken away (−), with a reason. Taking away stops at an empty jar: it takes at most the
 * minutes in the jar, the PENALTY records what was actually taken, and an empty jar is 409 empty_jar.
 * With a client `id`, a repeat returns the first answer and changes nothing.
 */
export async function adjust(deps: Deps, family: Family, parent: Parent, childId: string, input: AdjustInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const earlier = await previousAdjust(deps, family.id, childId, input.id);
    if (earlier) return balance(deps, family.id, earlier);
    const child = await requireChild(deps, family.id, childId);
    const deltaMin = input.deltaMin > 0 ? input.deltaMin : -Math.min(-input.deltaMin, Math.floor(child.balanceSec / 60));
    if (deltaMin === 0) throw conflict('empty_jar', 'The jar is empty: there are no minutes to take away');
    const deltaSec = deltaMin * 60;
    const entry: LedgerEntry = {
      id: newId(), childId, deltaSec, type: deltaSec > 0 ? 'BONUS' : 'PENALTY', reason: input.reason,
      createdBy: `parent:${parent.sub}`, createdAt: deps.now(), ...(deltaSec > 0 && {handoff: 'PENDING' as const}),
    };
    const result = await deps.repo.addEntry(family.id, entry, {
      ...(input.id !== undefined && {ref: {id: input.id, value: {kind: 'adjust', entry}}}),
      // What was taken adds to the hand-off debt, and the jar must still hold it when this is written.
      ...(deltaSec < 0 && {debtSec: -deltaSec, minBalanceSec: -deltaSec}),
    });
    if (result === 'ok') return balance(deps, family.id, entry);
    // The same request landed at the same moment, or the jar changed (or the kid is gone): look again.
  }
  throw busy();
}

/** The entry an earlier request with this client id made, if any. */
async function previousAdjust(deps: Deps, familyId: string, childId: string, id: string | undefined): Promise<LedgerEntry | undefined> {
  if (id === undefined) return undefined;
  const done = await deps.repo.getRef(familyId, childId, id);
  if (done && done.kind !== 'adjust') throw conflict('id_in_use', 'This id was already used for something else');
  return done?.entry;
}

export async function history(deps: Deps, family: Family, childId: string, limit: number) {
  await requireChild(deps, family.id, childId);
  return {entries: (await deps.repo.entries(family.id, childId, limit)).map(entryView)};
}

const total = (entries: LedgerEntry[]) => entries.reduce((sum, e) => sum + e.deltaSec, 0);

/**
 * What the parent adds in Amazon Kids: earned time still PENDING minus the penalty debt, never below 0.
 *
 * The debt is a running total on the child (`debtSec`): a PENALTY adds to it. Marking entries DONE pays it off from
 * those entries' time first, because the parent was told to add that much less. SKIPPED entries pay nothing (no time
 * was added for them), so the debt waits for the next hand-off.
 */
export async function handoff(deps: Deps, family: Family, childId: string) {
  const child = await requireChild(deps, family.id, childId);
  const pending = await deps.repo.pendingEntries(family.id, childId);
  return {
    pendingMinutes: Math.max(0, Math.floor((total(pending) - child.debtSec) / 60)),
    entries: pending.sort(newestFirst).map(entryView),
  };
}

/** Marks entries DONE or SKIPPED. Ids that aren't PENDING (any more) are ignored, so a repeat is harmless. */
export async function settleHandoff(deps: Deps, family: Family, childId: string, input: HandoffInput) {
  const wanted = new Set(input.entryIds);
  for (let attempt = 0; attempt < 3; attempt++) {
    const child = await requireChild(deps, family.id, childId);
    const chosen = (await deps.repo.pendingEntries(family.id, childId)).filter(e => wanted.has(e.id));
    let debt = input.status === 'DONE' ? child.debtSec : 0;
    let settled = true;
    // One transaction holds at most 100 writes: 99 entries and the child.
    for (let i = 0; i < chosen.length && settled; i += 99) {
      const batch = chosen.slice(i, i + 99);
      const paid = Math.min(debt, total(batch));
      settled = await deps.repo.settleEntries(family.id, childId, batch, input.status, paid);
      if (settled) debt -= paid;
    }
    if (settled) return handoff(deps, family, childId);
    // Another hand-off landed at the same moment: read again (settled entries are no longer pending).
  }
  throw busy();
}

/**
 * A finished brain game, checked on the TV: GAME_MARBLES, capped by the kid's daily cap minus the game marbles
 * already earned on the family's local today. Idempotent on the result id.
 */
export async function recordGame(deps: Deps, family: Family, device: Device, input: GameInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [done, child] = await Promise.all([deps.repo.getRef(family.id, input.childId, input.id), requireChild(deps, family.id, input.childId)]);
    if (done) return {marbles: done.kind === 'game' ? done.marbles : 0, balanceSec: child.balanceSec};
    const now = deps.now();
    const day = localDay(now, family.timezone);
    const earned = child.gameDay === day ? (child.gameMarbles ?? 0) : 0;
    const marbles = Math.max(0, Math.min(GAME_MARBLES, child.games.dailyCapMarbles - earned));
    const entry: LedgerEntry | undefined = marbles > 0 ? {
      id: newId(), childId: child.id, deltaSec: marbles * MARBLE_SEC, type: 'GAME', reason: input.topic,
      refId: input.id, createdBy: `tv:${device.id}`, createdAt: now, handoff: 'PENDING',
    } : undefined;
    const result = await deps.repo.creditGame(family.id, input.id, {
      childId: child.id,
      marbles,
      before: {day: child.gameDay, marbles: child.gameMarbles},
      after: {day, marbles: earned + marbles},
      ...(entry && {entry}),
    });
    if (result === 'ok') return {marbles, balanceSec: (await requireChild(deps, family.id, child.id)).balanceSec};
    // The same result just landed (a resend), or another game counted meanwhile: look again.
  }
  throw busy();
}
