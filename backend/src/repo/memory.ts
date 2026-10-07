/**
 * In-memory storage for the tests and the local dev server. It follows the same rules as dynamo.ts: the same
 * conditions, and every method's writes happen all at once or not at all. Values are copied in and out, so callers
 * can't change stored data by accident.
 */
import type {ChildProfile, Decision, FamilyFields, Repo} from '../domain/repo';
import type {
  Character, CharacterArt, Chore, Child, Claim, Connection, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, PushSubscription, Ref,
} from '../domain/types';

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
  characters: Map<string, Character>;
  art: Map<string, CharacterArt>;
  /** "<key>#<window start>" → uses in that window, and when the window ends */
  rates: Map<string, {count: number; until: number}>;
}

const copy = <T>(value: T): T => structuredClone(value);
const emptyData = (): FamilyData => ({
  children: new Map(), chores: new Map(), claims: new Map(), slots: new Map(), entries: new Map(), refs: new Map(), devices: new Map(),
  characters: new Map(), art: new Map(), rates: new Map(),
});
const slotOf = (claim: Claim) => `${claim.childId}#${claim.choreId}#${claim.slot}`;
const newestFirst = (a: LedgerEntry, b: LedgerEntry) => b.createdAt - a.createdAt || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);

export class MemoryRepo implements Repo {
  private families = new Map<string, Family>();
  private stores = new Map<string, FamilyData>();
  private users = new Map<string, string>();
  private pairings = new Map<string, Pairing>();
  private leases = new Map<string, {holder: string; until: number}>();
  /** parent sub → the name kids see */
  private parentNames = new Map<string, string>();
  private connections = new Map<string, Connection>();
  /** familyId → endpoint → subscription */
  private subscriptions = new Map<string, Map<string, PushSubscription>>();

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

  async updateFamily(familyId: string, fields: FamilyFields) {
    const family = this.families.get(familyId);
    if (!family) return undefined;
    Object.assign(family, copy(fields));
    return copy(family);
  }

  async getParentName(sub: string) {
    return this.parentNames.get(sub);
  }

  async setParentName(sub: string, name: string) {
    this.parentNames.set(sub, name);
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

  async updateChildProfile(familyId: string, childId: string, profile: ChildProfile) {
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
    for (const [id, character] of data.characters) if (character.childId === childId) data.characters.delete(id);
    for (const [id, art] of data.art) if (art.childId === childId) data.art.delete(id);
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
    const {claim, entry, token, chore} = decision;
    if (data.claims.get(claim.id)?.status !== 'waiting') return 'not_waiting' as const;
    const child = data.children.get(claim.childId);
    if ((entry || token) && (!child || child.balanceSec !== decision.balanceSec)) return 'changed' as const;
    if (chore && data.chores.get(chore.before.id)?.updatedAt !== chore.before.updatedAt) return 'chore_changed' as const;
    data.claims.set(claim.id, copy(claim));
    if (decision.releaseSlot) data.slots.delete(slotOf(claim));
    if (entry && child) {
      data.entries.set(entry.id, copy(entry));
      child.balanceSec += entry.deltaSec;
    }
    if (token && child) child.characterTokens = (child.characterTokens ?? 0) + 1;
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

  async addEntry(familyId: string, entry: LedgerEntry, options: {ref?: {id: string; value: Ref}; debtSec?: number; minBalanceSec?: number} = {}) {
    const data = this.data(familyId);
    const refKey = options.ref && `${entry.childId}#${options.ref.id}`;
    if (refKey && data.refs.has(refKey)) return 'duplicate' as const;
    const child = data.children.get(entry.childId);
    if (!child || child.balanceSec < (options.minBalanceSec ?? 0)) return 'changed' as const;
    data.entries.set(entry.id, copy(entry));
    child.balanceSec += entry.deltaSec;
    child.debtSec += options.debtSec ?? 0;
    if (refKey && options.ref) data.refs.set(refKey, copy(options.ref.value));
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

  async adjustments(familyId: string, since: number) {
    return [...this.data(familyId).entries.values()]
      .filter(e => (e.type === 'BONUS' || e.type === 'PENALTY') && e.createdAt >= since)
      .sort(newestFirst)
      .map(copy);
  }

  async settleEntries(
    familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number,
    due: {sec: number; day: string},
  ) {
    const data = this.data(familyId);
    const child = data.children.get(childId);
    const stored = entries.map(e => data.entries.get(e.id));
    if (stored.some(e => e?.handoff !== 'PENDING') || (debtPaidSec > 0 && (!child || child.debtSec < debtPaidSec))) return false;
    if (due.sec > 0 && (!child || (child.handoffDueDay !== undefined && child.handoffDueDay !== due.day))) return false;
    for (const entry of stored) entry!.handoff = status;
    if (child) {
      child.debtSec -= debtPaidSec;
      if (due.sec > 0) {
        child.handoffDueSec = (child.handoffDueSec ?? 0) + due.sec;
        child.handoffDueDay = due.day;
      }
    }
    return true;
  }

  async settleDue(familyId: string, childId: string, {entry, debtPaidSec, read}: {
    entry?: LedgerEntry; debtPaidSec: number; read: Pick<Child, 'balanceSec' | 'debtSec' | 'handoffDueSec' | 'handoffDueDay'>;
  }) {
    const data = this.data(familyId);
    const child = data.children.get(childId);
    if (!child || child.balanceSec !== read.balanceSec || child.debtSec !== read.debtSec || child.handoffDueSec !== read.handoffDueSec
      || child.handoffDueDay !== read.handoffDueDay || (entry && data.entries.has(entry.id))) return false;
    if (entry) {
      data.entries.set(entry.id, copy(entry));
      child.balanceSec += entry.deltaSec;
    }
    child.debtSec -= debtPaidSec;
    delete child.handoffDueSec;
    delete child.handoffDueDay;
    return true;
  }

  async startCharacter(familyId: string, character: Character) {
    const data = this.data(familyId);
    const child = data.children.get(character.childId);
    if (!child || (child.characterTokens ?? 0) < 1) return 'no_tokens' as const;
    child.characterTokens = (child.characterTokens ?? 0) - 1;
    data.characters.set(character.id, copy(character));
    return 'ok' as const;
  }

  async getCharacter(familyId: string, characterId: string) {
    const character = this.data(familyId).characters.get(characterId);
    return character && copy(character);
  }

  async listCharacters(familyId: string, childId?: string) {
    return [...this.data(familyId).characters.values()].filter(c => childId === undefined || c.childId === childId).map(copy);
  }

  async getCharacterArt(familyId: string, characterId: string) {
    const art = this.data(familyId).art.get(characterId);
    return art && copy(art);
  }

  async listCharacterArt(familyId: string, childId?: string) {
    return [...this.data(familyId).art.values()].filter(a => childId === undefined || a.childId === childId).map(copy);
  }

  async finishCharacter(familyId: string, art: CharacterArt, readyAt: number) {
    const data = this.data(familyId);
    const character = data.characters.get(art.id);
    if (character?.status !== 'drawing') return false;
    character.status = 'ready';
    character.readyAt = readyAt;
    data.art.set(art.id, copy(art));
    return true;
  }

  async failCharacter(familyId: string, character: Character) {
    const data = this.data(familyId);
    const stored = data.characters.get(character.id);
    const child = data.children.get(character.childId);
    if (stored?.status !== 'drawing' || !child) return false;
    stored.status = 'needs_help';
    child.characterTokens = (child.characterTokens ?? 0) + 1;
    return true;
  }

  async removeCharacter(familyId: string, character: Character) {
    const data = this.data(familyId);
    const stored = data.characters.get(character.id);
    if (stored?.status !== character.status) return false;
    const child = data.children.get(stored.childId);
    if (stored.status !== 'needs_help' && !child) return false;
    data.characters.delete(character.id);
    data.art.delete(character.id);
    if (stored.status !== 'needs_help' && child) child.characterTokens = (child.characterTokens ?? 0) + 1;
    return true;
  }

  async takeRate(familyId: string, key: string, windowStart: number, windowMs: number, limit: number) {
    const rates = this.stores.get(familyId)?.rates;
    if (!rates) return false;
    const slot = `${key}#${windowStart}`;
    const used = rates.get(slot) ?? {count: 0, until: windowStart + windowMs};
    if (used.count >= limit) return false;
    rates.set(slot, {count: used.count + 1, until: used.until});
    return true;
  }

  async takeLease(name: string, holder: string, until: number, now: number) {
    const held = this.leases.get(name);
    if (held && held.holder !== holder && held.until > now) return false;
    this.leases.set(name, {holder, until});
    return true;
  }

  async releaseLease(name: string, holder: string) {
    if (this.leases.get(name)?.holder === holder) this.leases.delete(name);
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

  async addConnection(connection: Connection) {
    this.connections.set(connection.id, copy(connection));
  }

  async familyConnections(familyId: string, now: number) {
    return [...this.connections.values()].filter(c => c.familyId === familyId && c.expiresAt > now).map(copy);
  }

  async removeConnection(connectionId: string) {
    this.connections.delete(connectionId);
  }

  async putPushSubscription(familyId: string, subscription: PushSubscription) {
    const family = this.subscriptions.get(familyId) ?? new Map<string, PushSubscription>();
    family.set(subscription.endpoint, copy(subscription));
    this.subscriptions.set(familyId, family);
  }

  async deletePushSubscription(familyId: string, endpoint: string) {
    this.subscriptions.get(familyId)?.delete(endpoint);
  }

  async pushSubscriptions(familyId: string) {
    return [...(this.subscriptions.get(familyId)?.values() ?? [])].map(copy);
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
