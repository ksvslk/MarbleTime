/**
 * Stored records → API shapes (openapi.yaml components). Fields are listed one by one, in a fixed order, so
 * internal fields never leak and the same data always serialises the same way (the TV's ETag relies on it).
 * Stored values from before the daily budget (job minutes in 5s, kids without a maximum) are read by today's rules.
 */
import {budgetOf, jobMinutes} from './budget';
import {voiceStyleOf} from './voice-style';
import {type Character, type CharacterArt, type CharacterCard, type Chore, type Child, type Claim, type Device, type Family, type Layer, type LedgerEntry, type Repeat, voiceOf} from './types';

export const familyView = (f: Family) => ({
  id: f.id, name: f.name, lang: f.lang, timezone: f.timezone, caps: f.caps, voice: f.voice, hasPin: f.pin !== null, createdAt: f.createdAt,
});

export const childView = (c: Child) => {
  const {dailyBaseMin, dailyMaxMin} = budgetOf(c);
  return {
    id: c.id, name: c.name, avatar: c.avatar, color: c.color, age: c.age, balanceSec: c.balanceSec, dailyBaseMin, dailyMaxMin,
    characterTokens: c.characterTokens ?? 0,
  };
};

const repeatView = (r: Repeat): Repeat => (r.kind === 'weekdays' ? {kind: r.kind, days: [...r.days]} : {kind: r.kind});

export const choreView = (k: Chore) => ({
  id: k.id, title: k.title, icon: k.icon, color: k.color, minutes: jobMinutes(k.minutes), routine: k.routine ?? false, repeat: repeatView(k.repeat),
  childIds: [...k.childIds], createdAt: k.createdAt,
});

export const claimView = (c: Claim) => ({
  id: c.id, childId: c.childId, choreId: c.choreId, choreTitle: c.choreTitle, status: c.status, minutes: jobMinutes(c.minutes), createdAt: c.createdAt,
  ...(c.decidedAt !== undefined && {decidedAt: c.decidedAt}),
  ...(c.decidedBy !== undefined && {decidedBy: c.decidedBy}),
  ...(c.approverName !== undefined && {approverName: c.approverName}),
  ...(c.reward !== undefined && {reward: c.reward}),
  ...(c.minutesCredited !== undefined && {minutesCredited: c.minutesCredited}),
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

const cardView = (c: CharacterCard): CharacterCard => ({what: c.what, colours: [...c.colours], outfit: c.outfit, mood: c.mood, detail: c.detail});

/** A character for the parent app; `svg` only once it is ready. */
export const characterView = (c: Character, art?: CharacterArt) => ({
  id: c.id, childId: c.childId, status: c.status, description: c.description, name: c.name, card: cardView(c.card), voice: voiceOf(c.voice),
  voiceStyle: {...voiceStyleOf(c)},
  ...(c.status === 'ready' && art && {svg: art.svg}),
  createdAt: c.createdAt,
  ...(c.readyAt !== undefined && {readyAt: c.readyAt}),
});

/** A character in the TV's state: no words or art (the art comes from GET /device/characters/{id}); its mood for speaking. */
export const deviceCharacterView = (c: Character) => ({
  id: c.id, childId: c.childId, status: c.status, name: c.name, voice: voiceOf(c.voice), mood: c.card.mood, createdAt: c.createdAt,
});

const layerView = (l: Layer) => ({
  ...(l.part !== undefined && {part: l.part}),
  ...(l.parent !== undefined && {parent: l.parent}),
  ...(l.pivot !== undefined && {pivot: [l.pivot[0], l.pivot[1]]}),
  svg: l.svg,
});

/** What the TV draws and animates. */
export const characterArtView = (c: Character, art: CharacterArt) => ({
  id: c.id, name: c.name, voice: voiceOf(c.voice), viewBox: art.viewBox, layers: art.layers.map(layerView),
});

export type ClaimView = ReturnType<typeof claimView>;

/** Oldest first (the order things were added); ids break ties so the order is stable. */
export const byCreated = (a: {createdAt: number; id: string}, b: {createdAt: number; id: string}) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const newestFirst = (a: {createdAt: number; id: string}, b: {createdAt: number; id: string}) => byCreated(b, a);
