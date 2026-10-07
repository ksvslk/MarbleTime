/** Claims: a kid's "I did it!" on the TV, and a grown-up's yes or not yet (docs/03 §4.1; rewards: budget.ts). */
import {jobMinutes, rewardFor} from './budget';
import type {Deps} from './deps';
import {busy, conflict, notFound} from './errors';
import {bumped, withoutChild} from './family';
import {currentChild} from './ledger';
import {pushNewClaim} from './push';
import type {Decision} from './repo';
import {checkTvPin} from './pin';
import {newId} from './secrets';
import {isoWeekday, localDay, WEEK} from './time';
import type {Claim, ClaimStatus, Device, Family, LedgerEntry} from './types';
import type {ClaimInput, DecideInput} from './validate';
import {claimView, newestFirst} from './views';

/** GET /claims shows every waiting claim and at most this many decided ones, the latest first. */
const HISTORY = 200;

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
    id: input.id, childId: child.id, choreId: chore.id, choreTitle: chore.title, minutes: jobMinutes(chore.minutes), routine: chore.routine ?? false,
    status: 'waiting', createdAt, slot: chore.repeat.kind === 'once' ? 'once' : day,
  };
  switch (await deps.repo.createClaim(family.id, claim)) {
    case 'created':
      deps.changed(family.id);
      await pushNewClaim(deps, family, claim, child.name);
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
    if (await deps.repo.deleteClaim(family.id, claim)) {
      deps.changed(family.id);
      return;
    }
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
    const decision: Decision = yes ? await approval(deps, family, decided, who, now) : {claim: decided, releaseSlot: true};
    if ((await deps.repo.decideClaim(family.id, decision)) === 'ok') {
      deps.changed(family.id);
      return claimView(decision.claim);
    }
    // Someone decided it, changed the one-off job or the kid's jar at the same moment: look again.
  }
  throw busy();
}

/**
 * What a yes gives (budget.ts rewardFor, the same rule on the phone and on the TV): marbles into the jar while it has
 * room (waiting for the Amazon Kids hand-off), a character token once it's full, praise for a routine job. A parent
 * who set a name signs it ("– Dad"). A one-off job is then done for this kid.
 */
async function approval(deps: Deps, family: Family, claim: Claim, who: Who, now: number): Promise<Decision> {
  const familyId = family.id;
  // The jar as of now: yesterday's hand-off has left it.
  const [child, chore, approverName] = await Promise.all([
    currentChild(deps, family, claim.childId, true),
    deps.repo.getChore(familyId, claim.choreId),
    who.by === 'parent' ? deps.repo.getParentName(who.sub) : undefined,
  ]);
  if (!child) throw notFound('child');
  // Claims from before routine jobs existed follow the job as it is now.
  const {reward, minutesCredited} = rewardFor(child, {minutes: claim.minutes, routine: claim.routine ?? chore?.routine ?? false});
  const approved: Claim = {...claim, reward, minutesCredited, ...(approverName !== undefined && {approverName})};
  const entry: LedgerEntry | undefined = reward === 'marbles' ? {
    id: newId(), childId: claim.childId, deltaSec: minutesCredited * 60, type: 'CHORE', reason: claim.choreTitle,
    refId: claim.id, createdBy: createdBy(who), createdAt: now, handoff: 'PENDING',
  } : undefined;
  const credit = {...(entry && {entry}), ...(reward === 'character' && {token: true}), balanceSec: child.balanceSec};
  if (chore?.repeat.kind !== 'once' || !chore.childIds.includes(claim.childId)) return {claim: approved, releaseSlot: false, ...credit};
  // "Gone once approved": the kid comes off the job, and with nobody left the job goes. The slot is freed,
  // so a parent who puts the kid back on the job makes it doable again.
  const after = withoutChild(chore, claim.childId);
  return {claim: approved, releaseSlot: true, ...credit, chore: {before: chore, after: after && {...after, updatedAt: bumped(deps, chore)}}};
}

/** A grown-up decides on the TV with the family PIN (pin.ts: more than 5 wrong PINs a minute on one TV → 429). */
export async function decideOnTv(deps: Deps, family: Family, device: Device, claimId: string, input: DecideInput) {
  await checkTvPin(deps, family, device, input.pin);
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
