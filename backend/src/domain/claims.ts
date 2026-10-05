/** Claims: a kid's "I did it!" on the TV, and a grown-up's yes or not yet (docs/03 §4.1). */
import type {Deps} from './deps';
import {ApiError, busy, conflict, notFound} from './errors';
import {bumped, withoutChild} from './family';
import type {Decision} from './repo';
import {newId, pinMatches} from './secrets';
import {DAY, isoWeekday, localDay, MINUTE} from './time';
import type {Claim, ClaimStatus, Device, Family, LedgerEntry} from './types';
import type {ClaimInput, DecideInput} from './validate';
import {claimView, newestFirst} from './views';

const WEEK = 7 * DAY;
/** GET /claims shows every waiting claim and at most this many decided ones, the latest first. */
const HISTORY = 200;
/** Wrong grown-ups PINs allowed per TV per minute; the next try gets 429. */
const PIN_TRIES = 5;

export type Who = {by: 'parent'; sub: string} | {by: 'tv'; deviceId: string};
const createdBy = (who: Who) => (who.by === 'parent' ? `parent:${who.sub}` : `tv:${who.deviceId}`);

/**
 * "I did it!". Idempotent on the TV's claim id (its outbox may resend). A job can be claimed at most once per
 * family-local day per kid (a waiting or approved claim holds the day); weekday jobs only on their days; a one-off
 * job only while the kid is still on it.
 */
export async function claimChore(deps: Deps, family: Family, input: ClaimInput) {
  const existing = await deps.repo.getClaim(family.id, input.id);
  if (existing) return {created: false, claim: claimView(existing)};
  const [child, chore] = await Promise.all([deps.repo.getChild(family.id, input.childId), deps.repo.getChore(family.id, input.choreId)]);
  if (!child) throw notFound('child');
  if (!chore) throw notFound('job');
  if (!chore.childIds.includes(child.id)) {
    throw conflict('not_on_board', "This job isn't on this kid's board (a one-off job goes once it is approved)");
  }
  const now = deps.now();
  // The kid's own time counts (an outbox may upload after midnight), unless the TV's clock is clearly off.
  const createdAt = input.at <= now && input.at > now - WEEK ? input.at : now;
  const day = localDay(createdAt, family.timezone);
  if (chore.repeat.kind === 'weekdays' && !chore.repeat.days.includes(isoWeekday(day))) {
    throw conflict('not_today', "This job isn't on today");
  }
  const claim: Claim = {
    id: input.id, childId: child.id, choreId: chore.id, choreTitle: chore.title, minutes: chore.minutes,
    status: 'waiting', createdAt, slot: chore.repeat.kind === 'once' ? 'once' : day,
  };
  switch (await deps.repo.createClaim(family.id, claim)) {
    case 'created':
      return {created: true, claim: claimView(claim)};
    case 'exists': {
      const again = await deps.repo.getClaim(family.id, claim.id);
      if (!again) throw busy();
      return {created: false, claim: claimView(again)};
    }
    case 'slot_taken':
      throw conflict('already_claimed', chore.repeat.kind === 'once' ? 'This job is already waiting for a grown-up' : 'This job was already done today');
  }
}

/** "Oops!": the kid takes back a waiting claim. Already gone is fine; once a grown-up decided, it's too late. */
export async function takeBack(deps: Deps, family: Family, claimId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const claim = await deps.repo.getClaim(family.id, claimId);
    if (!claim) return;
    if (claim.status !== 'waiting') throw conflict('already_decided', `A grown-up already decided (${claim.status})`);
    if (await deps.repo.deleteClaim(family.id, claim)) return;
  }
  throw busy();
}

/**
 * Yes or not yet, exactly once. Repeating the same decision returns the claim unchanged (nothing is credited
 * twice); the opposite decision after one was made is a 409.
 */
export async function decide(deps: Deps, family: Family, claimId: string, yes: boolean, who: Who) {
  const status: ClaimStatus = yes ? 'approved' : 'rejected';
  for (let attempt = 0; attempt < 3; attempt++) {
    const claim = await deps.repo.getClaim(family.id, claimId);
    if (!claim) throw notFound('claim');
    if (claim.status === status) return claimView(claim);
    if (claim.status !== 'waiting') throw conflict('already_decided', `This claim was already ${claim.status}`);
    const now = deps.now();
    const decided: Claim = {...claim, status, decidedAt: now, decidedBy: who.by};
    const decision: Decision = yes ? await approval(deps, family.id, decided, who, now) : {claim: decided, releaseSlot: true};
    if ((await deps.repo.decideClaim(family.id, decision)) === 'ok') return claimView(decided);
    // Someone decided it, or changed the one-off job, at the same moment: look again.
  }
  throw busy();
}

/** The claimed minutes go to the kid, waiting for the Amazon Kids hand-off. A one-off job is then done for this kid. */
async function approval(deps: Deps, familyId: string, claim: Claim, who: Who, now: number): Promise<Decision> {
  const entry: LedgerEntry = {
    id: newId(), childId: claim.childId, deltaSec: claim.minutes * 60, type: 'CHORE', reason: claim.choreTitle,
    refId: claim.id, createdBy: createdBy(who), createdAt: now, handoff: 'PENDING',
  };
  const chore = await deps.repo.getChore(familyId, claim.choreId);
  if (chore?.repeat.kind !== 'once' || !chore.childIds.includes(claim.childId)) return {claim, releaseSlot: false, entry};
  // "Gone once approved": the kid comes off the job, and with nobody left the job goes. The slot is freed,
  // so a parent who puts the kid back on the job makes it doable again.
  const after = withoutChild(chore, claim.childId);
  return {claim, releaseSlot: true, entry, chore: {before: chore, after: after && {...after, updatedAt: bumped(deps, chore)}}};
}

/** A grown-up decides on the TV with the family PIN. More than 5 wrong PINs a minute on one TV → 429. */
export async function decideOnTv(deps: Deps, family: Family, device: Device, claimId: string, input: DecideInput) {
  const now = deps.now();
  const fails = (device.pinFails ?? []).filter(time => now - time < MINUTE);
  if (fails.length >= PIN_TRIES) {
    const wait = Math.ceil((fails[0] + MINUTE - now) / 1000);
    throw new ApiError(429, 'too_many_tries', 'Too many wrong PINs on this TV; wait a minute', {'retry-after': String(wait)});
  }
  if (!family.pin) throw new ApiError(403, 'no_pin', 'Set a grown-ups PIN in the parent app first');
  if (!pinMatches(input.pin, family.pin)) {
    await deps.repo.updateDevice(family.id, device.id, {pinFails: [...fails, now]});
    throw new ApiError(403, 'wrong_pin', 'Wrong PIN');
  }
  return decide(deps, family, claimId, input.yes, {by: 'tv', deviceId: device.id});
}

/** Newest first: every waiting claim, plus the latest decided ones (filtered by `status` if given). */
export async function listClaims(deps: Deps, family: Family, status?: ClaimStatus) {
  const [waiting, decided] = await Promise.all([
    status === undefined || status === 'waiting' ? deps.repo.waitingClaims(family.id) : [],
    status === 'waiting' ? [] : deps.repo.decidedClaims(family.id, 0, HISTORY),
  ]);
  const claims = [...waiting, ...decided.filter(c => status === undefined || c.status === status)];
  return {claims: claims.sort(newestFirst).map(claimView)};
}

/** For the TV: waiting claims, plus those decided in the last 7 days, newest first. */
export async function recentClaims(deps: Deps, familyId: string, now: number) {
  const [waiting, decided] = await Promise.all([deps.repo.waitingClaims(familyId), deps.repo.decidedClaims(familyId, now - WEEK, HISTORY)]);
  return [...waiting, ...decided].sort(newestFirst);
}
