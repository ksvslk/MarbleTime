/**
 * In-memory storage for the tests and the local dev server. It follows the same rules as dynamo.ts: the same
 * conditions, and every method's writes happen all at once or not at all. Values are copied in and out, so callers
 * can't change stored data by accident.
 */
import type {Decision, GameCredit, Repo} from '../domain/repo';
import type {Chore, Child, Claim, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, Ref} from '../domain/types';

interface FamilyData {
  children: Map<string, Child>;
  chores: Map<string, Chore>;
  claims: Map<string, Claim>;
  /** "<childId>#<choreId>#<day|once>" → claim id */
  slots: Map<string, string>;
  entries: Map<string, LedgerEntry>;
  /** "<childId>#<client id>" → what that request produced */
  refs: Map<string, Ref>;
  devices: Map<string, Device>;
}

const copy = <T>(value: T): T => structuredClone(value);
const emptyData = (): FamilyData => ({
  children: new Map(), chores: new Map(), claims: new Map(), slots: new Map(), entries: new Map(), refs: new Map(), devices: new Map(),
});
const slotOf = (claim: Claim) => `${claim.childId}#${claim.choreId}#${claim.slot}`;
const newestFirst = (a: LedgerEntry, b: LedgerEntry) => b.createdAt - a.createdAt || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);

export class MemoryRepo implements Repo {
  private families = new Map<string, Family>();
  private stores = new Map<string, FamilyData>();
  private users = new Map<string, string>();
  private pairings = new Map<string, Pairing>();

  /** A family's data; for an unknown family a throwaway empty one (nothing is found, writes go nowhere). */
  private data(familyId: string): FamilyData {
    return this.stores.get(familyId) ?? emptyData();
  }

  async familyIdOf(sub: string) {
    return this.users.get(sub);
  }

  async createFamily(family: Family, parent: Parent) {
    this.families.set(family.id, copy(family));
    this.stores.set(family.id, emptyData());
    this.users.set(parent.sub, family.id);
  }

  async getFamily(familyId: string) {
    const family = this.families.get(familyId);
    return family && copy(family);
  }

  async putFamily(family: Family) {
    if (this.families.has(family.id)) this.families.set(family.id, copy(family));
  }

  async listChildren(familyId: string) {
    return [...this.data(familyId).children.values()].map(copy);
  }

  async getChild(familyId: string, childId: string) {
    const child = this.data(familyId).children.get(childId);
    return child && copy(child);
  }

  async putChild(familyId: string, child: Child) {
    this.stores.get(familyId)?.children.set(child.id, copy(child));
  }

  async updateChildProfile(familyId: string, childId: string, profile: Partial<Pick<Child, 'name' | 'avatar' | 'color' | 'age' | 'games'>>) {
    const child = this.data(familyId).children.get(childId);
    if (!child) return undefined;
    Object.assign(child, copy(profile));
    return copy(child);
  }

  async deleteChild(familyId: string, childId: string) {
    const data = this.data(familyId);
    data.children.delete(childId);
    for (const [id, entry] of data.entries) if (entry.childId === childId) data.entries.delete(id);
    for (const [id, claim] of data.claims) if (claim.childId === childId) data.claims.delete(id);
    for (const slot of data.slots.keys()) if (slot.startsWith(`${childId}#`)) data.slots.delete(slot);
    for (const ref of data.refs.keys()) if (ref.startsWith(`${childId}#`)) data.refs.delete(ref);
  }

  async listChores(familyId: string) {
    return [...this.data(familyId).chores.values()].map(copy);
  }

  async getChore(familyId: string, choreId: string) {
    const chore = this.data(familyId).chores.get(choreId);
    return chore && copy(chore);
  }

  async putChore(familyId: string, chore: Chore, expectUpdatedAt?: number) {
    const data = this.stores.get(familyId);
    const current = data?.chores.get(chore.id);
    if (!data || (expectUpdatedAt === undefined ? current : current?.updatedAt !== expectUpdatedAt)) return false;
    data.chores.set(chore.id, copy(chore));
    return true;
  }

  async deleteChore(familyId: string, choreId: string, expectUpdatedAt?: number) {
    const chores = this.data(familyId).chores;
    if (expectUpdatedAt !== undefined && chores.get(choreId)?.updatedAt !== expectUpdatedAt) return false;
    chores.delete(choreId);
    return true;
  }

  async getClaim(familyId: string, claimId: string) {
    const claim = this.data(familyId).claims.get(claimId);
    return claim && copy(claim);
  }

  async createClaim(familyId: string, claim: Claim) {
    const data = this.data(familyId);
    if (data.claims.has(claim.id)) return 'exists' as const;
    if (data.slots.has(slotOf(claim))) return 'slot_taken' as const;
    data.claims.set(claim.id, copy(claim));
    data.slots.set(slotOf(claim), claim.id);
    return 'created' as const;
  }

  async deleteClaim(familyId: string, claim: Claim) {
    const data = this.data(familyId);
    if (data.claims.get(claim.id)?.status !== 'waiting') return false;
    data.claims.delete(claim.id);
    data.slots.delete(slotOf(claim));
    return true;
  }

  async decideClaim(familyId: string, decision: Decision) {
    const data = this.data(familyId);
    const {claim, entry, chore} = decision;
    const child = entry && data.children.get(entry.childId);
    if (data.claims.get(claim.id)?.status !== 'waiting' || (entry && !child)) return 'not_waiting' as const;
    if (chore && data.chores.get(chore.before.id)?.updatedAt !== chore.before.updatedAt) return 'chore_changed' as const;
    data.claims.set(claim.id, copy(claim));
    if (decision.releaseSlot) data.slots.delete(slotOf(claim));
    if (entry && child) {
      data.entries.set(entry.id, copy(entry));
      child.balanceSec += entry.deltaSec;
    }
    if (chore?.after) data.chores.set(chore.after.id, copy(chore.after));
    else if (chore) data.chores.delete(chore.before.id);
    return 'ok' as const;
  }

  async waitingClaims(familyId: string) {
    return [...this.data(familyId).claims.values()].filter(c => c.status === 'waiting').map(copy);
  }

  async decidedClaims(familyId: string, since: number, limit: number) {
    return [...this.data(familyId).claims.values()]
      .filter(c => c.decidedAt !== undefined && c.decidedAt >= since)
      .sort((a, b) => b.decidedAt! - a.decidedAt! || (b.id > a.id ? 1 : -1))
      .slice(0, limit)
      .map(copy);
  }

  async addEntry(familyId: string, entry: LedgerEntry, options: {ref?: {id: string; value: Ref}; debtSec?: number} = {}) {
    const data = this.data(familyId);
    const refKey = options.ref && `${entry.childId}#${options.ref.id}`;
    if (refKey && data.refs.has(refKey)) return 'duplicate' as const;
    const child = data.children.get(entry.childId);
    if (!child) return 'no_child' as const;
    data.entries.set(entry.id, copy(entry));
    child.balanceSec += entry.deltaSec;
    child.debtSec += options.debtSec ?? 0;
    if (refKey && options.ref) data.refs.set(refKey, copy(options.ref.value));
    return 'ok' as const;
  }

  async creditGame(familyId: string, ref: string, credit: GameCredit) {
    const data = this.data(familyId);
    const refKey = `${credit.childId}#${ref}`;
    if (data.refs.has(refKey)) return 'duplicate' as const;
    if (credit.entry) {
      const child = data.children.get(credit.childId);
      if (!child || child.gameDay !== credit.before.day || (credit.before.day !== undefined && child.gameMarbles !== credit.before.marbles)) {
        return 'changed' as const;
      }
      data.entries.set(credit.entry.id, copy(credit.entry));
      child.balanceSec += credit.entry.deltaSec;
      child.gameDay = credit.after.day;
      child.gameMarbles = credit.after.marbles;
    }
    data.refs.set(refKey, {kind: 'game', marbles: credit.marbles});
    return 'ok' as const;
  }

  async getRef(familyId: string, childId: string, id: string) {
    const ref = this.data(familyId).refs.get(`${childId}#${id}`);
    return ref && copy(ref);
  }

  async entries(familyId: string, childId: string, limit: number) {
    return [...this.data(familyId).entries.values()].filter(e => e.childId === childId).sort(newestFirst).slice(0, limit).map(copy);
  }

  async pendingEntries(familyId: string, childId: string) {
    return [...this.data(familyId).entries.values()].filter(e => e.childId === childId && e.handoff === 'PENDING').map(copy);
  }

  async settleEntries(familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number) {
    const data = this.data(familyId);
    const child = data.children.get(childId);
    const stored = entries.map(e => data.entries.get(e.id));
    if (stored.some(e => e?.handoff !== 'PENDING') || (debtPaidSec > 0 && (!child || child.debtSec < debtPaidSec))) return false;
    for (const entry of stored) entry!.handoff = status;
    if (child) child.debtSec -= debtPaidSec;
    return true;
  }

  async createPairing(pairing: Pairing) {
    if (this.pairings.has(pairing.code)) return false;
    this.pairings.set(pairing.code, copy(pairing));
    return true;
  }

  async getPairing(code: string) {
    const pairing = this.pairings.get(code);
    return pairing && copy(pairing);
  }

  async confirmPairing(code: string, device: Device, now: number) {
    const pairing = this.pairings.get(code);
    const data = this.stores.get(device.familyId);
    if (!data || pairing?.status !== 'waiting' || pairing.expiresAt < now) return false;
    this.pairings.set(code, {...pairing, status: 'paired', familyId: device.familyId, deviceId: device.id});
    data.devices.set(device.id, copy(device));
    return true;
  }

  async issueToken(code: string, familyId: string, deviceId: string, tokenHash: string) {
    const pairing = this.pairings.get(code);
    const device = this.data(familyId).devices.get(deviceId);
    if (pairing?.status !== 'paired' || pairing.tokenIssued || !device) return false;
    pairing.tokenIssued = true;
    device.tokenHash = tokenHash;
    return true;
  }

  async deviceByToken(tokenHash: string) {
    for (const data of this.stores.values()) {
      for (const device of data.devices.values()) if (device.tokenHash === tokenHash) return copy(device);
    }
    return undefined;
  }

  async getDevice(familyId: string, deviceId: string) {
    const device = this.data(familyId).devices.get(deviceId);
    return device && copy(device);
  }

  async listDevices(familyId: string) {
    return [...this.data(familyId).devices.values()].map(copy);
  }

  async updateDevice(familyId: string, deviceId: string, fields: Partial<Pick<Device, 'name' | 'mode' | 'lastSeen' | 'appVersion' | 'pinFails'>>) {
    const device = this.data(familyId).devices.get(deviceId);
    if (!device) return undefined;
    Object.assign(device, copy(fields));
    return copy(device);
  }

  async deleteDevice(familyId: string, deviceId: string) {
    this.data(familyId).devices.delete(deviceId);
  }
}
