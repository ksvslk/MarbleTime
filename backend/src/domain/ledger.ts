/** The ledger: bonuses and penalties, history, and the Amazon Kids hand-off (docs/03 §6). */
import type {Deps} from './deps';
import {busy, conflict, notFound} from './errors';
import {newId} from './secrets';
import {localDay, nextDay, startOfDay} from './time';
import type {Child, Family, LedgerEntry, Parent} from './types';
import type {AdjustInput, HandoffInput} from './validate';
import {entryView, newestFirst} from './views';

/**
 * Settles a kid's hand-off from before today. Minutes marked handed off (DONE or SKIPPED) stay in the jar for the rest
 * of the family's local day: they are today's TV, so the daily maximum holds and the TV's marbles don't vanish when a
 * parent taps "I added it". After the next local midnight, the kid's first read or write takes them out of the jar
 * with one HANDOFF entry, written once (it is conditional on the balance, the debt and the due as read, like an
 * approval), dated at that midnight, and never below an empty jar.
 *
 * Whatever the jar couldn't give up had already left it with a minus (whose debt waits for a hand-off): it pays that
 * debt, so no minutes stay in the jar for good. (The jar then always holds pending minutes + today's due − the debt.)
 */
export async function settleDue(deps: Deps, family: Family, child: Child): Promise<{child: Child; settled: boolean}> {
  let current = child;
  for (let attempt = 0; attempt < 3; attempt++) {
    const {handoffDueSec: dueSec, handoffDueDay: dueDay, ...rest} = current;
    const now = deps.now();
    if (!dueSec || dueDay === undefined || dueDay >= localDay(now, family.timezone)) return {child: current, settled: false};
    const takeSec = Math.max(0, Math.min(dueSec, current.balanceSec));
    const paid = Math.min(dueSec - takeSec, current.debtSec);
    const entry: LedgerEntry | undefined = takeSec > 0 ? {
      id: newId(), childId: current.id, deltaSec: -takeSec, type: 'HANDOFF', reason: `Handed off on ${dueDay}`, createdBy: 'system',
      createdAt: Math.min(now, startOfDay(nextDay(dueDay), family.timezone)),
    } : undefined;
    if (await deps.repo.settleDue(family.id, current.id, {...(entry && {entry}), debtPaidSec: paid, read: current})) {
      return {child: {...rest, balanceSec: current.balanceSec - takeSec, debtSec: current.debtSec - paid}, settled: true};
    }
    // Something else changed the kid at the same moment (or settled it): look again.
    const again = await deps.repo.getChild(family.id, current.id);
    if (!again) throw notFound('child');
    current = again;
  }
  throw busy();
}

/** A kid as of now (a hand-off due from before today settled first); on a write path the family hears `changed` if it settled. */
export async function currentChild(deps: Deps, family: Family, childId: string, write: boolean): Promise<Child | undefined> {
  const child = await deps.repo.getChild(family.id, childId);
  if (!child) return undefined;
  const result = await settleDue(deps, family, child);
  if (result.settled && write) deps.changed(family.id);
  return result.child;
}

/** All the family's kids as of now (reads: a settlement just shows in what they return). */
export async function currentChildren(deps: Deps, family: Family): Promise<Child[]> {
  return Promise.all((await deps.repo.listChildren(family.id)).map(async child => (await settleDue(deps, family, child)).child));
}

async function requireChild(deps: Deps, family: Family, childId: string, write: boolean): Promise<Child> {
  const child = await currentChild(deps, family, childId, write);
  if (!child) throw notFound('child');
  return child;
}

async function balance(deps: Deps, family: Family, entry: LedgerEntry) {
  const child = await requireChild(deps, family, entry.childId, false);
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
    if (earlier) return balance(deps, family, earlier);
    const child = await requireChild(deps, family, childId, true);
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
    if (result === 'ok') {
      deps.changed(family.id);
      return balance(deps, family, entry);
    }
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
  await requireChild(deps, family, childId, false);
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
  const child = await requireChild(deps, family, childId, false);
  const pending = await deps.repo.pendingEntries(family.id, childId);
  return {
    pendingMinutes: Math.max(0, Math.floor((total(pending) - child.debtSec) / 60)),
    entries: pending.sort(newestFirst).map(entryView),
  };
}

/** Entries per transaction: at most 100 writes, so 99 entries and the child. */
const SETTLE_BATCH = 99;

/**
 * Marks entries DONE (added in Amazon Kids) or SKIPPED (settled another way). DONE pays the penalty debt from those
 * entries' minutes at once, so `pendingMinutes` is right straight away; their minutes leave the jar at the family's
 * next local midnight (settleDue): the entries' minutes less the debt they paid, since a minus already took those out.
 *
 * Ids that aren't PENDING (any more) are ignored, so marking the same entries twice settles them once. A due from an
 * earlier day is settled first. Entries settled before HANDOFF entries existed stay as they are: nothing is backfilled.
 */
export async function settleHandoff(deps: Deps, family: Family, childId: string, input: HandoffInput) {
  const wanted = new Set(input.entryIds);
  for (let attempt = 0; attempt < 3; attempt++) {
    const child = await requireChild(deps, family, childId, true);
    const day = localDay(deps.now(), family.timezone);
    const chosen = (await deps.repo.pendingEntries(family.id, childId)).filter(e => wanted.has(e.id));
    let debt = input.status === 'DONE' ? child.debtSec : 0;
    let settled = true;
    for (let i = 0; i < chosen.length && settled; i += SETTLE_BATCH) {
      const batch = chosen.slice(i, i + SETTLE_BATCH);
      const paid = Math.min(debt, total(batch));
      settled = await deps.repo.settleEntries(family.id, childId, batch, input.status, paid, {sec: total(batch) - paid, day});
      if (settled) debt -= paid;
    }
    if (settled) {
      if (chosen.length) deps.changed(family.id);
      return handoff(deps, family, childId);
    }
    // Another hand-off landed at the same moment, or midnight passed: read again (settled entries are no longer pending).
  }
  throw busy();
}
