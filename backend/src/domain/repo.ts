import type {Chore, Child, Claim, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, Ref} from './types';

export type ChildProfile = Partial<Pick<Child, 'name' | 'avatar' | 'color' | 'age' | 'dailyBaseMin' | 'games'>>;

/** How a claim gets decided: everything in it happens at once, or not at all. */
export interface Decision {
  /** The claim after the decision. It must still be waiting when this is written. */
  claim: Claim;
  /** Free the claim's "once per day" slot (rejected, or a one-off job), so the kid may claim again. */
  releaseSlot: boolean;
  /** Approved: the CHORE entry, added to the child's balance. */
  entry?: LedgerEntry;
  /** A one-off job: the kid comes off it (`after: null` deletes it). Fails if the job changed since `before`. */
  chore?: {before: Chore; after: Chore | null};
}

/** A finished brain game; `entry` is missing when the daily cap left no marbles (then only the answer is kept). */
export interface GameCredit {
  childId: string;
  /** What this result earned; repeats of the same result id get it back. */
  marbles: number;
  /** The child's game counter as read, and as it becomes; fails with "changed" if it moved meanwhile. */
  before: {day?: string; marbles?: number};
  after: {day: string; marbles: number};
  entry?: LedgerEntry;
}

/**
 * Storage, in domain terms. Two implementations: memory (tests, dev server) and DynamoDB (production).
 * Methods that return a result instead of throwing are conditional writes; nothing is written when they fail.
 * Lists come in any order unless a method says otherwise.
 */
export interface Repo {
  familyIdOf(sub: string): Promise<string | undefined>;
  /** The family, its first parent and the parent's link to it. */
  createFamily(family: Family, parent: Parent): Promise<void>;
  getFamily(familyId: string): Promise<Family | undefined>;
  putFamily(family: Family): Promise<void>;

  listChildren(familyId: string): Promise<Child[]>;
  getChild(familyId: string, childId: string): Promise<Child | undefined>;
  putChild(familyId: string, child: Child): Promise<void>;
  /** Name, avatar, colour, age, daily base and games only: balances and counters are never overwritten. */
  updateChildProfile(familyId: string, childId: string, profile: ChildProfile): Promise<Child | undefined>;
  /** The child and everything about them: ledger, claims, slots, refs. (Jobs are updated by the caller.) */
  deleteChild(familyId: string, childId: string): Promise<void>;

  listChores(familyId: string): Promise<Chore[]>;
  getChore(familyId: string, choreId: string): Promise<Chore | undefined>;
  /** Without `expectUpdatedAt`, creates the job; with it, replaces the job only if it hasn't changed since. */
  putChore(familyId: string, chore: Chore, expectUpdatedAt?: number): Promise<boolean>;
  deleteChore(familyId: string, choreId: string, expectUpdatedAt?: number): Promise<boolean>;

  getClaim(familyId: string, claimId: string): Promise<Claim | undefined>;
  /** Creates the claim and takes its slot. "exists": a claim with this id is already there. */
  createClaim(familyId: string, claim: Claim): Promise<'created' | 'exists' | 'slot_taken'>;
  /** Deletes a waiting claim and frees its slot; false if it isn't waiting (or there) any more. */
  deleteClaim(familyId: string, claim: Claim): Promise<boolean>;
  decideClaim(familyId: string, decision: Decision): Promise<'ok' | 'not_waiting' | 'chore_changed'>;
  waitingClaims(familyId: string): Promise<Claim[]>;
  /** Claims decided at or after `since`, the most recently decided first, at most `limit`. */
  decidedClaims(familyId: string, since: number, limit: number): Promise<Claim[]>;

  /**
   * Appends the entry and adds it to the child's balance (and `debtSec` to the penalty debt). With `minBalanceSec`,
   * only if the balance is at least that much. "changed": the child is gone, or the balance is below it.
   */
  addEntry(familyId: string, entry: LedgerEntry, options?: {ref?: {id: string; value: Ref}; debtSec?: number; minBalanceSec?: number}): Promise<'ok' | 'duplicate' | 'changed'>;
  creditGame(familyId: string, ref: string, credit: GameCredit): Promise<'ok' | 'duplicate' | 'changed'>;
  getRef(familyId: string, childId: string, id: string): Promise<Ref | undefined>;
  /** The newest `limit` entries, newest first. */
  entries(familyId: string, childId: string, limit: number): Promise<LedgerEntry[]>;
  pendingEntries(familyId: string, childId: string): Promise<LedgerEntry[]>;
  /** BONUS and PENALTY entries of all the family's kids made at or after `since`, newest first. */
  adjustments(familyId: string, since: number): Promise<LedgerEntry[]>;
  /** Marks PENDING entries done or skipped and takes `debtPaidSec` off the debt; false if one wasn't PENDING. At most 99 entries. */
  settleEntries(familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number): Promise<boolean>;

  /** False if the code is in use. */
  createPairing(pairing: Pairing): Promise<boolean>;
  getPairing(code: string): Promise<Pairing | undefined>;
  /** Marks the pairing paired and creates the device; false if it isn't waiting or has expired at `now`. */
  confirmPairing(code: string, device: Device, now: number): Promise<boolean>;
  /** Records that the token was handed out and links its hash to the device; false if already handed out or the device is gone. */
  issueToken(code: string, familyId: string, deviceId: string, tokenHash: string): Promise<boolean>;
  deviceByToken(tokenHash: string): Promise<Device | undefined>;
  getDevice(familyId: string, deviceId: string): Promise<Device | undefined>;
  listDevices(familyId: string): Promise<Device[]>;
  updateDevice(familyId: string, deviceId: string, fields: Partial<Pick<Device, 'name' | 'mode' | 'lastSeen' | 'appVersion' | 'pinFails'>>): Promise<Device | undefined>;
  deleteDevice(familyId: string, deviceId: string): Promise<void>;
}
