import type {CharacterMood, CharacterVoice, NotYetReason, ServerAdjustment, ServerState} from './api';
import {DEMO_PIN, EMPTY_FAMILY, Family, Job, Kid, KidId} from './data';
import {Lang, LANGS} from './i18n';
import {sha256Hex} from './sha256';
import {colors, MIN_PER_MARBLE} from './tokens';

/** The backend (the `dev` stack on AWS, deployed Oct 6). The Mac's dev server: marbletime://open?api=http://<mac>:8787 */
export const DEFAULT_API_URL = 'https://ny4o9o0um2.execute-api.us-east-1.amazonaws.com';

export type Screen =
  | {name: 'who'}
  | {name: 'board'; kidId: KidId; focusId?: string}
  | {name: 'claimed'; kidId: KidId; jobId: string}
  | {name: 'yay'; kidId: KidId; marbles: number; why: Why}
  | {name: 'meet'; kidId: KidId; characterId: string}
  | {name: 'gallery'; kidId: KidId}
  /** The kid describes their new character on the TV (they have a character token). */
  | {name: 'characterNew'; kidId: KidId}
  /** The grown-ups PIN; `for`: strict mode asked for it (to open the TV's settings, or 30 more minutes at bedtime). */
  | {name: 'pin'; for?: 'settings' | 'bedtime'}
  | {name: 'grownups'}
  | {name: 'puzzle'; kidId: KidId}
  /** A finished puzzle session: the star it earned (none for a second session in a day) and the character at the last star. */
  | {name: 'puzzleDone'; kidId: KidId; star: boolean; character: boolean; marks: boolean[]}
  /** Strict mode: who is watching (before a video app, or because it asked: nobody was picked, a jar is empty, bedtime). */
  | {name: 'watch'; why?: 'who' | 'empty' | 'bedtime'};

/**
 * What a job gives (docs/08, Decisions 2–4): marbles into the jar when they all fit under the daily ceiling; a new
 * character when they don't (with the marbles that did fit, if any); or praise alone (only on claims promised it
 * before Oct 13, when a job could be marked routine).
 */
export type Reward = 'marbles' | 'character' | 'praise';
/** A reward as a job card shows it: `minutes` go into the jar (0 for praise, and for a character from a full jar). */
export type Gives = {reward: Reward; minutes: number};

export type Used = {baseMin: number; earnedMin: number};

/**
 * A kid's puzzles (backend/openapi.yaml, Puzzles): one short session a day earns a star, `starsNeeded` stars earn a
 * new character, never TV time. `levels` is the kid's level per subject, as the backend placed them.
 */
export interface Puzzles {
  on: boolean;
  stars: number;
  starsNeeded: number;
  doneToday: boolean;
  levels: Record<string, number>;
}
/** Until the backend says otherwise: no puzzles (they come from the backend's bank, so an unpaired TV has none). */
export const NEW_PUZZLES: Puzzles = {on: false, stars: 0, starsNeeded: 5, doneToday: false, levels: {}};

export interface Claim {
  id: string;
  kidId: KidId;
  jobId: string;
  status: 'waiting' | 'approved' | 'rejected';
  at: number;
  decidedAt?: number;
  /** What the job card showed when the kid said "I did it!": what a yes gives. */
  promised?: Gives;
  reward?: Reward;
  minutesCredited?: number;
  /** Why a grown-up said "not yet", if they gave a reason. */
  notYetReason?: NotYetReason;
  /** The approving parent's name as kids see it ("Dad"); none when approved on the TV. */
  approverName?: string;
}

/** Why a "Yay!" is shown; the screen turns it into words in the family language. */
export type Why = {kind: 'job'; jobId: string; reward: Reward; approver?: string} | {kind: 'bonus'; reason: string};

/**
 * Good news that came while the kid was away, shown when they open their board, one at a time: a "Yay!" for an
 * approval or a bonus, or meeting a newly drawn character.
 */
export type Celebration = {id: string; kidId: KidId; marbles: number; why: Why} | {id: string; kidId: KidId; meet: string};

/** A kid's own character, drawn from their words (docs/08); "drawing" until the backend has drawn and checked it. */
export interface Character {
  id: string;
  kidId: KidId;
  status: 'drawing' | 'ready';
  name?: string;
  voice?: CharacterVoice;
  mood?: CharacterMood;
  createdAt: number;
}

/** Set once a parent paired this TV with the phone app; the backend is then the source of truth. */
export interface Link {
  token: string;
  deviceId: string;
  familyName: string;
  /** The family's grown-ups PIN as hex(sha256(salt + ":" + pin)), so the TV can check it offline. */
  pin: {salt: string; hash: string} | null;
  /** Where the backend pushes "something changed" (WebSocket); learnt from the first sync. */
  realtimeUrl?: string;
}

/** A change made on the TV that the backend hasn't confirmed yet. Sent in order; kept across restarts. */
export type Outbox =
  | {kind: 'claim'; id: string; childId: KidId; choreId: string; at: number}
  | {kind: 'undo'; id: string; claimId: string}
  | {kind: 'decide'; id: string; claimId: string; yes: boolean; reason?: NotYetReason}
  | {kind: 'puzzle'; id: string; childId: KidId; answers: {id: string; right: boolean}[]}
  | {kind: 'usage'; id: string; childId: KidId; seconds: number}
  | {kind: 'settings'; id: 'settings'; lang?: Lang; caps?: boolean; voice?: boolean};

export interface State {
  screen: Screen;
  /** The family language (a grown-ups setting). */
  lang: Lang;
  /** Kids and their jobs (from the parent app). */
  family: Family;
  /** Show kid-facing text in CAPITAL LETTERS (a grown-ups setting; many young kids learn capitals first). */
  caps: boolean;
  /** Read kid-facing lines out loud (a grown-ups setting, on by default). */
  voice: boolean;
  /** Earned minutes each kid hasn't used yet (the daily base comes on top, up to the ceiling). */
  balances: Record<KidId, number>;
  /** TV each kid has watched today, in minutes: how much of today's base, and how much earned time (already out of `balances`). */
  used: Record<KidId, Used>;
  /** Each kid's puzzles, as the backend says; a kid not listed has none. */
  puzzles: Record<KidId, Puzzles>;
  /** The backend's time left today per kid, in seconds: what a strict-mode TV counts down from. */
  leftSec: Record<KidId, number>;
  /** This TV counts watched time and keeps video apps for the kids who are watching (the parent app's TV mode "strict"). */
  strict: boolean;
  claims: Claim[];
  /** Approvals made while the kid was away; shown as "Yay!" when the kid opens the board. */
  celebrations: Celebration[];
  /** Bonuses and taken-away minutes from the phone (last 7 days), and which of them the TV has already shown. */
  adjustments: ServerAdjustment[];
  seenAdjustments: string[];
  /** The kids' characters (drawing or ready), and the ready ones this TV has already introduced. */
  characters: Character[];
  seenCharacters: string[];
  /** The backend (a test link can point it elsewhere: marbletime://open?api=…). */
  apiUrl: string;
  link: Link | null;
  outbox: Outbox[];
  /** A test link loaded sample data (layout checks, demos): the TV then works unpaired, with the demo PIN. */
  demo: boolean;
}

export type Action =
  | {type: 'go'; screen: Screen}
  | {type: 'claim'; kidId: KidId; jobId: string}
  | {type: 'undoClaim'; kidId: KidId; jobId: string}
  | {type: 'decide'; claimId: string; yes: boolean; reason?: NotYetReason}
  | {type: 'puzzleDone'; kidId: KidId; answers: {id: string; right: boolean}[]}
  | {type: 'watched'; kidId: KidId; seconds: number}
  /** The backend took the kid's idea: a character is being drawn, and the token is used. */
  | {type: 'characterStarted'; kidId: KidId; character: Character}
  | {type: 'setLang'; lang: Lang}
  | {type: 'setCaps'; caps: boolean}
  | {type: 'setVoice'; voice: boolean}
  | {type: 'setFamily'; family: Family; balances?: Record<KidId, number>}
  | {type: 'celebrated'; id: string}
  | {type: 'restore'; saved: unknown}
  | {type: 'setApi'; url: string}
  | {type: 'linked'; link: Link}
  | {type: 'unlink'}
  | {type: 'synced'; server: ServerState; at: number}
  | {type: 'sent'; id: string};

export const initialState: State = {
  screen: {name: 'who'},
  lang: 'en',
  family: EMPTY_FAMILY,
  caps: false,
  voice: true,
  balances: {},
  used: {},
  puzzles: {},
  leftSec: {},
  strict: false,
  claims: [],
  celebrations: [],
  adjustments: [],
  seenAdjustments: [],
  characters: [],
  seenCharacters: [],
  apiUrl: DEFAULT_API_URL,
  link: null,
  outbox: [],
  demo: false,
};

/** A random id the backend accepts as a client UUID (repeats of a request are then harmless). */
export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Queue a change for the backend, if this TV is paired. */
const queue = (state: State, item: Outbox): Outbox[] => (state.link ? [...state.outbox, item] : state.outbox);

/** Settings changed on a paired TV: one pending change, the latest value of each setting. */
const queueSettings = (state: State, change: {lang?: Lang; caps?: boolean; voice?: boolean}): Outbox[] => {
  if (!state.link) return state.outbox;
  const pending = state.outbox.find(o => o.kind === 'settings');
  return [...state.outbox.filter(o => o.kind !== 'settings'), {...pending, ...change, kind: 'settings', id: 'settings'}];
};

/** A screen for a kid who isn't in the family (removed on the phone, an old test link) becomes "Who's here?". */
const checked = (family: Family, screen: Screen): Screen => ('kidId' in screen && !family.kids.some(k => k.id === screen.kidId) ? {name: 'who'} : screen);

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'go':
      return {...state, screen: checked(state.family, action.screen)};
    case 'claim': {
      if (state.claims.some(c => c.kidId === action.kidId && c.jobId === action.jobId && c.status === 'waiting')) {
        return {...state, screen: {name: 'claimed', kidId: action.kidId, jobId: action.jobId}};
      }
      // What the card shows now is what a yes will give, whatever else is decided first.
      const promised = rewardFor(state, action.kidId, jobOf(state, action.kidId, action.jobId));
      const claim: Claim = {id: newId(), kidId: action.kidId, jobId: action.jobId, status: 'waiting', at: Date.now(), promised};
      return {
        ...state,
        claims: [...state.claims, claim],
        outbox: queue(state, {kind: 'claim', id: claim.id, childId: claim.kidId, choreId: claim.jobId, at: claim.at}),
        screen: {name: 'claimed', kidId: action.kidId, jobId: action.jobId},
      };
    }
    case 'undoClaim': {
      const claim = state.claims.find(c => c.kidId === action.kidId && c.jobId === action.jobId && c.status === 'waiting');
      // Not sent yet: just drop it from the outbox. Already sent: ask the backend to take it back.
      const unsent = state.outbox.some(o => o.kind === 'claim' && o.id === claim?.id);
      return {
        ...state,
        claims: state.claims.filter(c => c !== claim),
        outbox: !claim ? state.outbox : unsent ? state.outbox.filter(o => o.id !== claim.id) : queue(state, {kind: 'undo', id: `undo-${claim.id}`, claimId: claim.id}),
        screen: {name: 'board', kidId: action.kidId, focusId: action.jobId},
      };
    }
    case 'decide': {
      const claim = state.claims.find(c => c.id === action.claimId);
      if (!claim || claim.status !== 'waiting') return state;
      const reason = action.yes ? undefined : action.reason;
      const outbox = queue(state, {kind: 'decide', id: `decide-${claim.id}`, claimId: claim.id, yes: action.yes, ...(reason && {reason})});
      if (!action.yes) {
        return {...state, outbox, claims: state.claims.map(c => (c.id === claim.id ? {...c, status: 'rejected', decidedAt: Date.now(), ...(reason && {notYetReason: reason})} : c))};
      }
      // The same rule as the backend's, so the TV is right offline too; the next sync has the final word.
      const {reward, minutes} = givenFor(state, claim);
      return {
        ...state,
        outbox,
        claims: state.claims.map(c => (c.id === claim.id ? {...c, status: 'approved', decidedAt: Date.now(), reward, minutesCredited: minutes} : c)),
        balances: {...state.balances, [claim.kidId]: balanceOf(state, claim.kidId) + minutes},
        family: reward === 'character' ? withToken(state.family, claim.kidId) : state.family,
        celebrations: [...state.celebrations, {id: claim.id, kidId: claim.kidId, marbles: minutes / MIN_PER_MARBLE, why: {kind: 'job', jobId: claim.jobId, reward}}],
      };
    }
    case 'characterStarted':
      return {
        ...state,
        characters: [...state.characters.filter(c => c.id !== action.character.id), action.character],
        family: {...state.family, kids: state.family.kids.map(k => (k.id === action.kidId ? {...k, characterTokens: Math.max(0, (k.characterTokens ?? 0) - 1)} : k))},
        screen: {name: 'gallery', kidId: action.kidId},
      };
    case 'watched': {
      // Time on MarbleTime's own screen time (puzzles, the kid's characters) is TV time: it leaves the jar here at
      // once, today's base first and then earned time (the backend's rule), and is reported like everything else.
      const kid = kidOf(state, action.kidId);
      if (!kid || action.seconds < 1) return state;
      const minutes = Math.round(action.seconds / 60);
      const used = usedOf(state, action.kidId);
      const fromBase = Math.min(minutes, Math.max(0, kid.dailyBaseMin - used.baseMin));
      const fromEarned = Math.min(minutes - fromBase, balanceOf(state, action.kidId));
      const left = state.leftSec[action.kidId];
      return {
        ...state,
        used: {...state.used, [action.kidId]: {baseMin: used.baseMin + fromBase, earnedMin: used.earnedMin + fromEarned}},
        balances: {...state.balances, [action.kidId]: balanceOf(state, action.kidId) - fromEarned},
        leftSec: left === undefined ? state.leftSec : {...state.leftSec, [action.kidId]: Math.max(0, left - action.seconds)},
        outbox: queue(state, {kind: 'usage', id: newId(), childId: action.kidId, seconds: Math.min(3600, Math.round(action.seconds))}),
      };
    }
    case 'puzzleDone': {
      // The backend's rule (puzzle-results.ts), so the TV is right offline too: every finished round earns a star,
      // and the last star needed becomes a new character.
      const now = puzzlesOf(state, action.kidId);
      const star = true;
      const character = now.stars + 1 >= now.starsNeeded;
      const next: Puzzles = {...now, doneToday: true, stars: character ? 0 : now.stars + 1};
      return {
        ...state,
        puzzles: {...state.puzzles, [action.kidId]: next},
        family: character ? withToken(state.family, action.kidId) : state.family,
        outbox: queue(state, {kind: 'puzzle', id: newId(), childId: action.kidId, answers: action.answers}),
        // How the round went, question by question (right or missed), for the screen that ends it.
        screen: {name: 'puzzleDone', kidId: action.kidId, star, character, marks: action.answers.map(answer => answer.right)},
      };
    }
    case 'setLang':
      return {...state, lang: action.lang, outbox: queueSettings(state, {lang: action.lang})};
    case 'setCaps':
      return {...state, caps: action.caps, outbox: queueSettings(state, {caps: action.caps})};
    case 'setVoice':
      return {...state, voice: action.voice, outbox: queueSettings(state, {voice: action.voice})};
    case 'setFamily':
      return {...state, family: {kids: action.family.kids.map(normalKid), jobs: action.family.jobs}, balances: action.balances ?? {}, used: {}, puzzles: {}, claims: [], celebrations: [], characters: [], seenCharacters: [], screen: {name: 'who'}, demo: true};
    case 'celebrated':
      return {...state, celebrations: state.celebrations.filter(c => c.id !== action.id)};
    case 'restore':
      return restore(state, action.saved);
    case 'setApi':
      return {...state, apiUrl: action.url};
    case 'linked':
      // A fresh pairing: old news on the backend (bonuses, approvals) isn't replayed as celebrations.
      return {...state, link: action.link, outbox: [], celebrations: [], adjustments: [], seenAdjustments: [], characters: [], seenCharacters: [], demo: false, screen: {name: 'who'}};
    case 'unlink':
      // Back to a fresh TV: no family, the welcome screen.
      return {...initialState, lang: state.lang, caps: state.caps, voice: state.voice, apiUrl: state.apiUrl, screen: {name: 'who'}};
    case 'synced':
      return applyServer(state, action.server, action.at);
    case 'sent':
      return {...state, outbox: state.outbox.filter(o => o.id !== action.id)};
  }
}

const COLORS: Record<string, string> = {peach: colors.peach, mint: colors.mint, sky: colors.sky, lilac: colors.lilac, gold: colors.gold};

/** The ceiling from health guidance when a kid has none yet (docs/08 §1.1): 60 minutes under 7, 90 from 7. */
export const defaultDailyMax = (age: number) => (age < 7 ? 60 : 90);
const tens = (minutes: number) => Math.round(minutes / MIN_PER_MARBLE) * MIN_PER_MARBLE;

/** A kid as the screens use it, whatever an older backend or an old save left out. */
export function normalKid(kid: Kid): Kid {
  const dailyMaxMin = Math.max(MIN_PER_MARBLE, tens(kid.dailyMaxMin ?? defaultDailyMax(kid.age)));
  // The default base is half the ceiling, rounded up to whole marbles: 60 → 30, 90 → 50 (a third to a half earnable, docs/08 §1.5).
  const dailyBaseMin = Math.min(dailyMaxMin, Math.max(0, tens(kid.dailyBaseMin ?? Math.ceil(dailyMaxMin / 2 / MIN_PER_MARBLE) * MIN_PER_MARBLE)));
  return {...kid, dailyMaxMin, dailyBaseMin, characterTokens: kid.characterTokens ?? 0};
}

const clockMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** A kid's bedtime as strict mode's counter takes it: minutes after local midnight (none: no bedtime). */
export const bedtimeMinutes = (kid: Pick<Kid, 'bedtime'>) => kid.bedtime && {bedFrom: clockMinutes(kid.bedtime.from), bedTo: clockMinutes(kid.bedtime.to)};

/** The kid's bedtime has begun at `time` (the TV's local time); it may run past midnight. */
export function inBedtime(kid: Pick<Kid, 'bedtime'>, time: number): boolean {
  const window = bedtimeMinutes(kid);
  if (!window) return false;
  const d = new Date(time);
  const now = d.getHours() * 60 + d.getMinutes();
  return window.bedFrom <= window.bedTo ? now >= window.bedFrom && now < window.bedTo : now >= window.bedFrom || now < window.bedTo;
}

/** A job's worth: one to three marbles. */
const jobMinutes = (minutes: number) => Math.min(30, Math.max(MIN_PER_MARBLE, Math.ceil(minutes / MIN_PER_MARBLE) * MIN_PER_MARBLE));

/** The family as the phone app set it up, in the shapes the TV screens use. Jobs not due today are left out. */
export function familyFromServer(server: ServerState, now: number): Family {
  const weekday = ((new Date(now).getDay() + 6) % 7) + 1; // ISO: Monday = 1
  const due = (repeat: ServerState['chores'][number]['repeat']) => repeat.kind !== 'weekdays' || repeat.days.includes(weekday);
  return {
    kids: server.children.map(c =>
      normalKid({id: c.id, name: c.name, avatar: c.avatar, avatarBg: COLORS[c.color] ?? colors.sky, age: c.age, dailyBaseMin: c.dailyBaseMin as number, dailyMaxMin: c.dailyMaxMin as number, characterTokens: c.characterTokens, ...(c.bedtime && {bedtime: c.bedtime})}),
    ),
    jobs: Object.fromEntries(
      server.children.map(child => [
        child.id,
        server.chores
          .filter(chore => chore.childIds.includes(child.id) && due(chore.repeat))
          .map((chore): Job => ({id: chore.id, title: chore.title, icon: chore.icon, color: COLORS[chore.color] ?? colors.peach, minutes: jobMinutes(chore.minutes), once: chore.repeat.kind === 'once', routine: chore.routine ?? false})),
      ]),
    ),
  };
}

/**
 * Takes in the backend's state. Changes still in the outbox stay as the TV has them (the backend
 * hasn't seen them yet), and jobs approved on the phone while they waited here become a "Yay!".
 */
export function applyServer(state: State, server: ServerState, now: number): State {
  const pendingClaims = new Set(state.outbox.flatMap(o => (o.kind === 'claim' ? [o.id] : [])));
  const undone = new Set(state.outbox.flatMap(o => (o.kind === 'undo' ? [o.claimId] : [])));
  const decided = new Map(state.outbox.flatMap(o => (o.kind === 'decide' ? [[o.claimId, o.yes] as const] : [])));
  const claims: Claim[] = [
    ...server.claims
      .filter(c => !undone.has(c.id))
      .map((c): Claim => {
        const here = decided.get(c.id);
        const status = c.status === 'waiting' && here !== undefined ? (here ? 'approved' : 'rejected') : c.status;
        return {id: c.id, kidId: c.childId, jobId: c.choreId, status, at: c.createdAt, decidedAt: c.decidedAt, promised: c.promised, reward: c.reward, minutesCredited: c.minutesCredited, notYetReason: c.notYetReason, approverName: c.approverName};
      }),
    ...state.claims.filter(c => pendingClaims.has(c.id)),
  ];
  const waitingHere = new Set(state.claims.filter(c => c.status === 'waiting').map(c => c.id));
  const approvedElsewhere = server.claims.filter(c => c.status === 'approved' && waitingHere.has(c.id) && !decided.has(c.id));
  // Bonuses given on the phone since the last sync are celebrated; on the first sync after pairing, nothing is new.
  const adjustments = server.adjustments ?? [];
  const seen = new Set(state.seenAdjustments);
  const newBonuses = firstSyncPending(state) ? [] : adjustments.filter(a => a.deltaMin > 0 && !seen.has(a.id));
  // A character that finished drawing is introduced once ("Meet …!"); on the first sync after pairing, none are new.
  const characters: Character[] = (server.characters ?? []).map(c => ({id: c.id, kidId: c.childId, status: c.status, name: c.name, voice: c.voice, mood: c.mood, createdAt: c.createdAt}));
  const ready = characters.filter(c => c.status === 'ready');
  const introduced = new Set(state.seenCharacters);
  const newCharacters = firstSyncPending(state) ? [] : ready.filter(c => !introduced.has(c.id));
  const readyIds = new Set(ready.map(c => c.id));
  // Settings changed here and not sent yet stay as the TV has them.
  const mine = state.outbox.some(o => o.kind === 'settings');
  const family = familyFromServer(server, now);
  const screen = checked(family, state.screen);
  // The kid was being asked for their character's words here and the token went meanwhile (said into the phone):
  // on to the collection, where the new character is being drawn.
  const saidElsewhere = screen.name === 'characterNew' && tokensOf(state, screen.kidId) > 0 && !family.kids.find(k => k.id === screen.kidId)?.characterTokens;
  return {
    ...state,
    screen: saidElsewhere ? {name: 'gallery', kidId: screen.kidId} : screen,
    lang: mine ? state.lang : server.family.lang,
    caps: mine ? state.caps : server.family.caps,
    voice: mine ? state.voice : server.family.voice,
    family,
    balances: Object.fromEntries(server.children.map(c => [c.id, Math.floor(c.balanceSec / 60)])),
    // A session finished here and not yet with the backend stays as the TV has it.
    puzzles: Object.fromEntries(server.children.map(c => [c.id, state.outbox.some(o => o.kind === 'puzzle' && o.childId === c.id) ? puzzlesOf(state, c.id) : (c.puzzles ?? NEW_PUZZLES)])),
    leftSec: Object.fromEntries(server.children.flatMap(c => (c.leftTodaySec === undefined ? [] : [[c.id, c.leftTodaySec]]))),
    strict: server.device?.mode === 'strict',
    used: Object.fromEntries(server.children.map(c => [c.id, usedFromServer(c, family.kids.find(k => k.id === c.id)?.dailyBaseMin ?? 0)])),
    claims,
    celebrations: [
      // A character a grown-up removed is never introduced.
      ...state.celebrations.filter(c => !('meet' in c) || readyIds.has(c.meet)),
      ...approvedElsewhere.map(c => {
        // A backend from before rewards counts as plain marbles.
        const minutes = c.minutesCredited ?? (c.reward ? 0 : c.minutes);
        const why: Why = {kind: 'job', jobId: c.choreId, reward: c.reward ?? 'marbles', approver: c.approverName};
        return {id: c.id, kidId: c.childId, marbles: Math.round(minutes / MIN_PER_MARBLE), why};
      }),
      ...newBonuses.map(a => ({id: a.id, kidId: a.childId, marbles: Math.round(a.deltaMin / MIN_PER_MARBLE), why: {kind: 'bonus', reason: a.reason} as Why})),
      ...newCharacters.map(c => ({id: `meet-${c.id}`, kidId: c.kidId, meet: c.id})),
    ],
    adjustments,
    seenAdjustments: adjustments.map(a => a.id),
    characters,
    seenCharacters: ready.map(c => c.id),
    link: state.link && {...state.link, familyName: server.family.name, pin: server.family.pin, realtimeUrl: server.realtimeUrl},
  };
}

/** Approved today (or ever, for a one-off job): off the board until it's due again. */
export function isDone(state: State, kidId: KidId, job: Job, now = Date.now()): boolean {
  const today = localDay(now);
  return state.claims.some(c => c.kidId === kidId && c.jobId === job.id && c.status === 'approved' && (job.once || localDay(c.at) === today));
}

/** Minutes taken away today, with the parent's reason: shown calmly on the kid's board. */
export function takenToday(state: State, kidId: KidId, now = Date.now()): ServerAdjustment[] {
  const today = localDay(now);
  return state.adjustments.filter(a => a.childId === kidId && a.deltaMin < 0 && localDay(a.at) === today);
}

/** Jobs a grown-up said "not yet" to today and the kid hasn't tried again: explained on the kid's board. */
export function notYetToday(state: State, kidId: KidId, now = Date.now()): Claim[] {
  const today = localDay(now);
  return state.claims
    .filter(c => c.kidId === kidId && c.status === 'rejected' && localDay(c.decidedAt ?? c.at) === today)
    .filter(c => !state.claims.some(other => other.kidId === kidId && other.jobId === c.jobId && other.at > c.at))
    .sort((a, b) => (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at));
}

/**
 * Good news shows where the kid can see it: on "Who's here?", on their own board or "Great job" screen.
 * On someone else's board or on the grown-ups' screens it waits for one of those.
 */
export function celebrationToShow(state: State): Celebration | undefined {
  const screen = state.screen;
  return state.celebrations.find(c => screen.name === 'who' || ((screen.name === 'board' || screen.name === 'claimed') && screen.kidId === c.kidId));
}

const kidOf = (state: State, kidId: KidId) => state.family.kids.find(k => k.id === kidId);
const jobOf = (state: State, kidId: KidId, jobId: string) => (state.family.jobs[kidId] ?? []).find(j => j.id === jobId);
const withToken = (family: Family, kidId: KidId): Family => ({
  ...family,
  kids: family.kids.map(k => (k.id === kidId ? {...k, characterTokens: (k.characterTokens ?? 0) + 1} : k)),
});

/**
 * What the backend says a kid watched today, in minutes. Left time is rounded down and watched time up, so the TV
 * never shows more than there is.
 */
function usedFromServer(child: {balanceSec: number; usedTodaySec?: number; leftTodaySec?: number}, dailyBaseMin: number): Used {
  if (child.usedTodaySec === undefined || child.leftTodaySec === undefined) return {baseMin: 0, earnedMin: 0};
  const baseLeftSec = Math.max(0, child.leftTodaySec - child.balanceSec);
  const baseUsedSec = Math.max(0, dailyBaseMin * 60 - baseLeftSec);
  return {baseMin: dailyBaseMin - Math.floor(baseLeftSec / 60), earnedMin: Math.ceil(Math.max(0, child.usedTodaySec - baseUsedSec) / 60)};
}
const usedOf = (state: State, kidId: KidId): Used => state.used[kidId] ?? {baseMin: 0, earnedMin: 0};

/** The jar: TV time left today = what is left of the daily base plus earned time not yet watched, never above the ceiling. */
export function timeToday(state: State, kidId: KidId): number {
  const kid = kidOf(state, kidId);
  if (!kid) return 0;
  return Math.max(0, Math.min(kid.dailyMaxMin, Math.max(0, kid.dailyBaseMin - usedOf(state, kidId).baseMin) + balanceOf(state, kidId)));
}

/**
 * Who's watching (strict mode): the kids still picked. A kid who can't watch any more (their jar ran out, the
 * backend's count can arrive after the lock; their bedtime began) drops out, so they never keep a sibling from watching.
 */
export function stillPicked(picked: KidId[], canWatch: (kidId: KidId) => boolean): KidId[] {
  return picked.filter(canWatch);
}

/** Minutes that can still be earned into today's jar: what was watched plus what is left never passes the ceiling. */
export function jarRoom(state: State, kidId: KidId): number {
  const kid = kidOf(state, kidId);
  return kid ? Math.max(0, kid.dailyMaxMin - kid.dailyBaseMin - balanceOf(state, kidId) - usedOf(state, kidId).earnedMin) : 0;
}

/** How many marbles today's jar holds now: the time left plus what can still be earned (the whole ceiling until TV is watched). */
export const jarSize = (state: State, kidId: KidId) => Math.floor((timeToday(state, kidId) + jarRoom(state, kidId)) / MIN_PER_MARBLE);

/** Full: not even one more marble fits, so the next approved job earns a new character. */
export const jarFull = (state: State, kidId: KidId) => jarRoom(state, kidId) < MIN_PER_MARBLE;

/** The kid's newest ready character: the one that stands by their jar, cheers and talks. */
export function buddyOf(state: State, kidId: KidId): Character | undefined {
  return state.characters.filter(c => c.kidId === kidId && c.status === 'ready').sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** A character of this kid's that the backend is still drawing. */
export const drawingFor = (state: State, kidId: KidId) => state.characters.some(c => c.kidId === kidId && c.status === 'drawing');

/** New characters the kid has earned and not asked for yet (a grown-up types or records the kid's idea). */
export const tokensOf = (state: State, kidId: KidId) => kidOf(state, kidId)?.characterTokens ?? 0;

/** Room in today's jar already promised to the kid's waiting jobs. */
const reservedFor = (state: State, kidId: KidId) =>
  state.claims.reduce((sum, c) => sum + (c.kidId === kidId && c.status === 'waiting' ? (c.promised?.minutes ?? 0) : 0), 0);

/**
 * What saying "I did it!" for this job would give now: the backend's rule (budget.ts rewardFor; docs/08, Decisions
 * 2–4), so the TV can tell the kid offline. A job that doesn't fit gives the marbles that do and a new character.
 */
export function rewardFor(state: State, kidId: KidId, job: Job | undefined): Gives {
  // Every job gives TV time (the founder, Oct 13): a job once marked routine is a job like any other.
  if (!job) return {reward: 'praise', minutes: 0};
  const room = Math.max(0, Math.floor((jarRoom(state, kidId) - reservedFor(state, kidId)) / MIN_PER_MARBLE) * MIN_PER_MARBLE);
  return job.minutes <= room ? {reward: 'marbles', minutes: job.minutes} : {reward: 'character', minutes: room};
}

/** What a job card shows: for a job that is waiting for a grown-up, what it was promised. */
export function givesOf(state: State, kidId: KidId, job: Job): Gives {
  const waiting = state.claims.find(c => c.kidId === kidId && c.jobId === job.id && c.status === 'waiting');
  return waiting?.promised ?? rewardFor(state, kidId, job);
}

/**
 * What a yes gives a waiting claim: its promise (the backend's keptPromise). Only the jar's maximum can still cut
 * it: then the part that fits goes in and the rest is a character. A claim from before promises gets today's room.
 */
export function givenFor(state: State, claim: Claim): Gives {
  const promised = claim.promised;
  if (!promised) {
    const job = jobOf(state, claim.kidId, claim.jobId);
    if (!job) return {reward: 'praise', minutes: 0};
    const room = Math.floor(jarRoom(state, claim.kidId) / MIN_PER_MARBLE) * MIN_PER_MARBLE;
    return job.minutes <= room ? {reward: 'marbles', minutes: job.minutes} : {reward: 'character', minutes: room};
  }
  if (promised.reward === 'praise') return promised;
  const fits = Math.min(promised.minutes, Math.floor(jarRoom(state, claim.kidId) / MIN_PER_MARBLE) * MIN_PER_MARBLE);
  return fits < promised.minutes ? {reward: 'character', minutes: fits} : promised;
}

/**
 * Screens that are screen time themselves: puzzles and the kid's characters. Time on them comes out of the kid's
 * jar like any other TV time (docs/08 §1.1: one daily maximum for everything on the TV); the board and its jobs don't.
 */
export const screenTimeKid = (screen: Screen): KidId | undefined =>
  screen.name === 'puzzle' || screen.name === 'puzzleDone' || screen.name === 'gallery' || screen.name === 'meet' || screen.name === 'characterNew' ? screen.kidId : undefined;

/** A kid's puzzles as this TV knows them. */
export const puzzlesOf = (state: State, kidId: KidId): Puzzles => state.puzzles[kidId] ?? NEW_PUZZLES;

/**
 * What a puzzle shows and says once the kid has answered. A right answer gets its "Yes!" and nothing more (the
 * founder, Oct 13: no explanation after a right answer). A miss gets "Look:" and the reason, which says what is
 * right with no word about the miss: explaining is what helps after an error (docs/08 §3.2; research R3: explain
 * when the question was hard for the child, a brief ✓ when it wasn't).
 */
export function afterAnswer(right: boolean, words: {yes: string; look: string; reason: string}): {lead: string; text: string; say: string[]} {
  return right ? {lead: words.yes, text: '', say: [words.yes]} : {lead: words.look, text: words.reason, say: [words.reason]};
}

/** Nothing to show until a phone is paired (test links aside): the welcome screen with its QR code. */
export const needsPairing = (state: State) => !state.link && !state.demo;

/** Just paired: the family arrives with the first sync (a family's name is never empty). */
export const firstSyncPending = (state: State) => state.link?.familyName === '';

/** The grown-ups PIN: the family's own once paired (the demo PIN only with a test link's sample data). */
export function checkPin(state: State, pin: string): boolean {
  const own = state.link?.pin;
  if (own) return sha256Hex(`${own.salt}:${pin}`) === own.hash;
  return state.demo && pin === DEMO_PIN;
}

/** "2026-10-05" in the TV's own time zone: daily jobs come back at local midnight. */
export function localDay(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What survives an app restart: everything except the screen (the app always opens on "Who's here?"). */
export type Saved = {version: 1} & Omit<State, 'screen'>;

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function toSaved(state: State, now = Date.now()): Saved {
  const {screen: _screen, ...rest} = state;
  // Decided claims are history; keep a week of it (the parent app keeps the full log in M2).
  return {version: 1, ...rest, claims: state.claims.filter(c => c.status === 'waiting' || now - c.at < WEEK)};
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Applies saved state, field by field; anything missing or malformed keeps the current value. */
export function restore(state: State, saved: unknown): State {
  if (!isRecord(saved) || saved.version !== 1) return state;
  const savedFamily = isRecord(saved.family) && Array.isArray(saved.family.kids) && isRecord(saved.family.jobs) ? (saved.family as unknown as Family) : undefined;
  // Saves from before the daily ceiling lack it (and still hold games): normalised until the next sync replaces them.
  const family = savedFamily ? {kids: savedFamily.kids.map(normalKid), jobs: savedFamily.jobs} : state.family;
  const restored: State = {
    ...state,
    lang: LANGS.some(l => l.id === saved.lang) ? (saved.lang as Lang) : state.lang,
    caps: typeof saved.caps === 'boolean' ? saved.caps : state.caps,
    voice: typeof saved.voice === 'boolean' ? saved.voice : state.voice,
    family,
    balances: isRecord(saved.balances) ? (saved.balances as Record<KidId, number>) : state.balances,
    used: isRecord(saved.used) ? (saved.used as Record<KidId, Used>) : state.used,
    puzzles: isRecord(saved.puzzles) ? (saved.puzzles as Record<KidId, Puzzles>) : state.puzzles,
    leftSec: isRecord(saved.leftSec) ? (saved.leftSec as Record<KidId, number>) : state.leftSec,
    strict: saved.strict === true,
    claims: Array.isArray(saved.claims) ? (saved.claims as Claim[]) : state.claims,
    // Celebrations saved in an older shape (no id, no reward, a game) are dropped rather than shown wrong.
    celebrations: Array.isArray(saved.celebrations)
      ? (saved.celebrations as Celebration[]).filter(
          c =>
            isRecord(c) &&
            typeof c.id === 'string' &&
            ('meet' in c ? typeof c.meet === 'string' : isRecord(c.why) && (c.why.kind === 'bonus' || (c.why.kind === 'job' && typeof c.why.reward === 'string'))),
        )
      : state.celebrations,
    characters: Array.isArray(saved.characters)
      ? (saved.characters as Character[]).filter(c => isRecord(c) && typeof c.id === 'string' && typeof c.kidId === 'string' && (c.status === 'drawing' || c.status === 'ready'))
      : state.characters,
    seenCharacters: Array.isArray(saved.seenCharacters) ? (saved.seenCharacters as string[]).filter(id => typeof id === 'string') : state.seenCharacters,
    apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl : state.apiUrl,
    link: isRecord(saved.link) && typeof saved.link.token === 'string' ? (saved.link as unknown as Link) : saved.link === null ? null : state.link,
    outbox: Array.isArray(saved.outbox) ? (saved.outbox as Outbox[]).filter(o => isRecord(o) && ['claim', 'undo', 'decide', 'settings'].includes(o.kind as string)) : state.outbox,
    adjustments: Array.isArray(saved.adjustments) ? (saved.adjustments as ServerAdjustment[]) : state.adjustments,
    seenAdjustments: Array.isArray(saved.seenAdjustments) ? (saved.seenAdjustments as string[]) : state.seenAdjustments,
  };
  restored.demo = typeof saved.demo === 'boolean' ? saved.demo : false;
  // Saves from before the welcome screen held the sample family on unpaired TVs: keep only the settings.
  return needsPairing(restored) ? {...initialState, lang: restored.lang, caps: restored.caps, voice: restored.voice, apiUrl: restored.apiUrl} : restored;
}

/** Marbles in the jar. Penalties can take a balance below zero: the jar is then just empty. */
export const marblesIn = (minutes: number) => Math.max(0, Math.floor(minutes / MIN_PER_MARBLE));
export const balanceOf = (state: State, kidId: KidId) => state.balances[kidId] ?? 0;
