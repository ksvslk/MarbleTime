/**
 * Stored records → API shapes (openapi.yaml components). Fields are listed one by one, in a fixed order, so
 * internal fields never leak and the same data always serialises the same way (the TV's ETag relies on it).
 */
import {type Chore, type Child, type Claim, DAILY_BASE_MIN, type Device, type Family, type LedgerEntry, type Repeat} from './types';

export const familyView = (f: Family) => ({
  id: f.id, name: f.name, lang: f.lang, timezone: f.timezone, caps: f.caps, voice: f.voice, hasPin: f.pin !== null, createdAt: f.createdAt,
});

export const childView = (c: Child) => ({
  id: c.id, name: c.name, avatar: c.avatar, color: c.color, age: c.age, balanceSec: c.balanceSec, dailyBaseMin: c.dailyBaseMin ?? DAILY_BASE_MIN,
  games: {topics: [...c.games.topics], dailyCapMarbles: c.games.dailyCapMarbles},
});

const repeatView = (r: Repeat): Repeat => (r.kind === 'weekdays' ? {kind: r.kind, days: [...r.days]} : {kind: r.kind});

export const choreView = (k: Chore) => ({
  id: k.id, title: k.title, icon: k.icon, color: k.color, minutes: k.minutes, repeat: repeatView(k.repeat), childIds: [...k.childIds], createdAt: k.createdAt,
});

export const claimView = (c: Claim) => ({
  id: c.id, childId: c.childId, choreId: c.choreId, choreTitle: c.choreTitle, status: c.status, minutes: c.minutes, createdAt: c.createdAt,
  ...(c.decidedAt !== undefined && {decidedAt: c.decidedAt}),
  ...(c.decidedBy !== undefined && {decidedBy: c.decidedBy}),
});

export const entryView = (e: LedgerEntry) => ({
  id: e.id, childId: e.childId, deltaSec: e.deltaSec, type: e.type, reason: e.reason,
  ...(e.refId !== undefined && {refId: e.refId}),
  createdBy: e.createdBy, createdAt: e.createdAt,
  ...(e.handoff !== undefined && {handoff: e.handoff}),
});

/** A bonus (+) or minutes taken away (−, what was actually taken), so the TV can say why a jar changed. */
export const adjustmentView = (e: LedgerEntry) => ({id: e.id, childId: e.childId, deltaMin: e.deltaSec / 60, reason: e.reason, at: e.createdAt});

export const deviceView = (d: Device) => ({
  id: d.id, name: d.name, platform: d.platform, mode: d.mode,
  ...(d.lastSeen !== undefined && {lastSeen: d.lastSeen}),
  createdAt: d.createdAt,
});

export type ClaimView = ReturnType<typeof claimView>;

/** Oldest first (the order things were added); ids break ties so the order is stable. */
export const byCreated = (a: {createdAt: number; id: string}, b: {createdAt: number; id: string}) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const newestFirst = (a: {createdAt: number; id: string}, b: {createdAt: number; id: string}) => byCreated(b, a);
