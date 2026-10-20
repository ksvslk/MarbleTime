import type {PuzzleProgress, PuzzleRound, PuzzleSet} from '../puzzles/pick';
import type {Character, CharacterArt, Chore, Child, Claim, Connection, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, PushPass, PushSubscription, Ref} from './types';

export type FamilyFields = Partial<Pick<Family, 'name' | 'lang' | 'timezone' | 'caps' | 'voice' | 'pin'>>;
export type ChildProfile = Partial<Pick<Child, 'name' | 'avatar' | 'color' | 'age' | 'dailyBaseMin' | 'dailyMaxMin' | 'puzzlesOff' | 'puzzleLevel' | 'bedtime'>>;

/** How a claim gets decided: everything in it happens at once, or not at all. */
export interface Decision {
  /** The claim after the decision. It must still be waiting when this is written. */
  claim: Claim;
  /** Free the claim's "once per day" slot (rejected, or a one-off job), so the kid may claim again. */
  releaseSlot: boolean;
  /** Approved with room in the jar: the CHORE entry, added to the child's balance. */
  entry?: LedgerEntry;
  /** Approved with a full jar: the kid gets a character token. */
  token?: boolean;
  /**
   * The child's balance the reward was worked out from. With `entry` or `token`, the decision is written only if the
   * balance is still this ("changed" otherwise), so two approvals at once can't overfill the jar.
   */
  balanceSec?: number;
  /** A one-off job: the kid comes off it (`after: null` deletes it). Fails if the job changed since `before`. */
  chore?: {before: Chore; after: Chore | null};
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
  /** Sets only the given fields (the TV and the parent app may change different ones at once); undefined if there's no such family. */
  updateFamily(familyId: string, fields: FamilyFields): Promise<Family | undefined>;

  /** The name a parent shows kids ("– Dad"), kept with the parent's sign-in, family or not. */
  getParentName(sub: string): Promise<string | undefined>;
  setParentName(sub: string, name: string): Promise<void>;

  listChildren(familyId: string): Promise<Child[]>;
  getChild(familyId: string, childId: string): Promise<Child | undefined>;
  putChild(familyId: string, child: Child): Promise<void>;
  /** Name, avatar, colour, age and the daily budget only: balances, tokens and counters are never overwritten. */
  updateChildProfile(familyId: string, childId: string, profile: ChildProfile): Promise<Child | undefined>;
  /** The child and everything about them: ledger, claims, slots, refs, characters. (Jobs are updated by the caller.) */
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
  /** "changed": the child is gone or their balance moved since it was read (decide again). */
  decideClaim(familyId: string, decision: Decision): Promise<'ok' | 'not_waiting' | 'chore_changed' | 'changed'>;
  waitingClaims(familyId: string): Promise<Claim[]>;
  /** Claims decided at or after `since`, the most recently decided first, at most `limit`. */
  decidedClaims(familyId: string, since: number, limit: number): Promise<Claim[]>;

  /**
   * Appends the entry and adds it to the child's balance (and `debtSec` to the penalty debt). With `minBalanceSec`,
   * only if the balance is at least that much. "changed": the child is gone, or the balance is below it.
   */
  /**
   * `used` (a USAGE entry): the kid's watched time on `day` after this entry, written only if the stored day is still
   * `prevDay` and, on the same day, the stored base part is still `prevBaseSec`.
   */
  addEntry(familyId: string, entry: LedgerEntry, options?: {ref?: {id: string; value: Ref}; debtSec?: number; minBalanceSec?: number; used?: Used}): Promise<'ok' | 'duplicate' | 'changed'>;
  getRef(familyId: string, childId: string, id: string): Promise<Ref | undefined>;
  /** A kid's next written puzzle session (puzzles/pick.ts PuzzleSet); gone with the kid. */
  getPuzzleSet(familyId: string, childId: string): Promise<PuzzleSet | undefined>;
  putPuzzleSet(familyId: string, childId: string, set: PuzzleSet): Promise<void>;
  /** A kid's finished puzzle rounds, newest last (puzzles/pick.ts PuzzleRound); gone with the kid. */
  getPuzzleRounds(familyId: string, childId: string): Promise<PuzzleRound[]>;
  putPuzzleRounds(familyId: string, childId: string, rounds: PuzzleRound[]): Promise<void>;
  /**
   * A finished puzzle session, all at once: the kid's stars, day and progress (levels, streaks, seen), a character token if one was earned, and
   * the session's id (so it counts once). 'changed' if the stored stars are no longer `prevStars`.
   */
  finishPuzzles(familyId: string, childId: string, done: {refId: string; day: string; stars: number; token: boolean; progress: PuzzleProgress; prevStars: number}): Promise<'ok' | 'duplicate' | 'changed'>;
  /** The newest `limit` entries, newest first. */
  entries(familyId: string, childId: string, limit: number): Promise<LedgerEntry[]>;
  pendingEntries(familyId: string, childId: string): Promise<LedgerEntry[]>;
  /** BONUS and PENALTY entries of all the family's kids made at or after `since`, newest first. */
  adjustments(familyId: string, since: number): Promise<LedgerEntry[]>;
  /**
   * Marks PENDING entries done or skipped, takes `debtPaidSec` off the debt and adds `due.sec` to the minutes due to
   * leave the jar after `due.day` (the child's due may only hold that day's minutes: settle older ones first). False if
   * an entry wasn't PENDING any more, the debt was too small, or the due is another day's (nothing is written then).
   * At most 99 entries.
   */
  settleEntries(
    familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number,
    due: {sec: number; day: string},
  ): Promise<boolean>;
  /**
   * Settles a child's due hand-off: appends the HANDOFF `entry` (if any) and takes its minutes off the balance, takes
   * `debtPaidSec` off the debt and clears the due, only if the balance, the debt and the due are still what was read.
   */
  settleDue(familyId: string, childId: string, settlement: {
    entry?: LedgerEntry; debtPaidSec: number; read: Pick<Child, 'balanceSec' | 'debtSec' | 'handoffDueSec' | 'handoffDueDay'>;
  }): Promise<boolean>;

  /** Uses one of the child's character tokens and stores the new character (drawing): "no_tokens" if none is left. */
  startCharacter(familyId: string, character: Character): Promise<'ok' | 'no_tokens'>;
  getCharacter(familyId: string, characterId: string): Promise<Character | undefined>;
  /** The family's characters (or one kid's), any status. */
  listCharacters(familyId: string, childId?: string): Promise<Character[]>;
  getCharacterArt(familyId: string, characterId: string): Promise<CharacterArt | undefined>;
  /** The family's (or one kid's) ready characters' art. */
  listCharacterArt(familyId: string, childId?: string): Promise<CharacterArt[]>;
  /** Stores the art and marks the character ready; false if it isn't drawing any more (removed meanwhile). */
  finishCharacter(familyId: string, art: CharacterArt, readyAt: number): Promise<boolean>;
  /** Marks a drawing character needs_help and gives the token back; false if it isn't drawing any more. */
  failCharacter(familyId: string, character: Character): Promise<boolean>;
  /**
   * Removes a character and its art, only if its status is still the one read (false otherwise: read it again). A
   * drawing or ready character gives the kid its token back; a needs_help one already did. A worker still drawing it
   * then finds it gone and stores nothing (finishCharacter and failCharacter need status drawing).
   */
  removeCharacter(familyId: string, character: Character): Promise<boolean>;

  /**
   * Counts one use of a limited thing (e.g. a TV's new speech lines) in a fixed time window starting at `windowStart`;
   * false, counting nothing, once `limit` uses are there. The count goes away after the window.
   */
  takeRate(familyId: string, key: string, windowStart: number, windowMs: number, limit: number): Promise<boolean>;

  /**
   * Holds `name` for `holder` until `until` (so only one makes a thing at a time, e.g. a speech line, whichever process
   * or Lambda it runs in): true if it was free, had run out by `now`, or was the holder's already (a renewal); false
   * while someone else holds it. A holder that dies lets it go when it runs out.
   */
  takeLease(name: string, holder: string, until: number, now: number): Promise<boolean>;
  /** Lets `name` go, if `holder` still holds it. */
  releaseLease(name: string, holder: string): Promise<void>;

  /** False if the code is in use. */
  /** A pass to answer a claim from its notification, under sha256(token); taking it returns it and removes it. */
  putPushPass(hash: string, pass: PushPass): Promise<void>;
  takePushPass(hash: string): Promise<PushPass | undefined>;
  createPairing(pairing: Pairing): Promise<boolean>;
  getPairing(code: string): Promise<Pairing | undefined>;
  /** Marks the pairing paired and creates the device; false if it isn't waiting or has expired at `now`. */
  confirmPairing(code: string, device: Device, now: number): Promise<boolean>;
  /** Records that the token was handed out and links its hash to the device; false if already handed out or the device is gone. */
  issueToken(code: string, familyId: string, deviceId: string, tokenHash: string): Promise<boolean>;
  deviceByToken(tokenHash: string): Promise<Device | undefined>;

  /** Stores an open realtime connection, findable by its id alone too (for $disconnect). */
  addConnection(connection: Connection): Promise<void>;
  /** The family's realtime connections that haven't expired by `now`. */
  familyConnections(familyId: string, now: number): Promise<Connection[]>;
  removeConnection(connectionId: string): Promise<void>;

  /** Saves a browser's push subscription in the family (the same endpoint replaces the old one). */
  putPushSubscription(familyId: string, subscription: PushSubscription): Promise<void>;
  deletePushSubscription(familyId: string, endpoint: string): Promise<void>;
  pushSubscriptions(familyId: string): Promise<PushSubscription[]>;
  getDevice(familyId: string, deviceId: string): Promise<Device | undefined>;
  listDevices(familyId: string): Promise<Device[]>;
  updateDevice(familyId: string, deviceId: string, fields: Partial<Pick<Device, 'name' | 'mode' | 'lastSeen' | 'appVersion' | 'pinFails'>>): Promise<Device | undefined>;
  deleteDevice(familyId: string, deviceId: string): Promise<void>;
}

/** A kid's watched time after a USAGE entry, and what was read before it (see Repo.addEntry). */
export interface Used {
  day: string;
  baseSec: number;
  earnedSec: number;
  prevDay?: string;
  prevBaseSec: number;
}
