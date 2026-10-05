import type {ServerState} from './api';
import {DAILY_GAME_MARBLES, DEMO_PIN, Family, Game, Job, KidId, SAMPLE_FAMILY} from './data';
import {Lang, LANGS} from './i18n';
import {sha256Hex} from './sha256';
import {colors, MIN_PER_MARBLE} from './tokens';

/** Where the backend is. Until it's deployed: the dev server on the Mac (scripts: `cd backend && npm run dev`). */
export const DEFAULT_API_URL = 'http://192.168.0.100:8787';

export type Screen =
  | {name: 'who'}
  | {name: 'board'; kidId: KidId; focusId?: string}
  | {name: 'claimed'; kidId: KidId; jobId: string}
  | {name: 'yay'; kidId: KidId; marbles: number; why: Why}
  | {name: 'game'; kidId: KidId; gameId: string}
  | {name: 'pin'}
  | {name: 'grownups'}
  | {name: 'pair'};

export interface Claim {
  id: string;
  kidId: KidId;
  jobId: string;
  status: 'waiting' | 'approved' | 'rejected';
  at: number;
}

/** Why marbles arrived; the screen turns it into words in the family language. */
export type Why = {kind: 'job'; jobId: string} | {kind: 'game'; gameId: string} | {kind: 'cap'};

export interface Celebration {
  kidId: KidId;
  marbles: number;
  jobId: string;
}

/** Set once a parent paired this TV with the phone app; the backend is then the source of truth. */
export interface Link {
  token: string;
  deviceId: string;
  familyName: string;
  /** The family's grown-ups PIN as hex(sha256(salt + ":" + pin)), so the TV can check it offline. */
  pin: {salt: string; hash: string} | null;
}

/** A change made on the TV that the backend hasn't confirmed yet. Sent in order; kept across restarts. */
export type Outbox =
  | {kind: 'claim'; id: string; childId: KidId; choreId: string; at: number}
  | {kind: 'undo'; id: string; claimId: string}
  | {kind: 'decide'; id: string; claimId: string; yes: boolean}
  | {kind: 'game'; id: string; childId: KidId; topic: string; correct: number; total: number; at: number};

export interface State {
  screen: Screen;
  /** The family language (a grown-ups setting). */
  lang: Lang;
  /** Kids, jobs and games (from the parent app in M2). */
  family: Family;
  /** Show kid-facing text in CAPITAL LETTERS (a grown-ups setting; many young kids learn capitals first). */
  caps: boolean;
  /** Read kid-facing lines out loud (a grown-ups setting, on by default). */
  voice: boolean;
  /** Minutes in each kid's jar. */
  balances: Record<KidId, number>;
  claims: Claim[];
  gameMarblesToday: Record<KidId, number>;
  /** The local day `gameMarblesToday` counts for ("2026-10-05"); a new day starts from zero. */
  gameDay: string;
  /** Approvals made while the kid was away; shown as "Yay!" when the kid opens the board. */
  celebrations: Celebration[];
  /** The backend (a test link can point it elsewhere: marbletime://open?api=…). */
  apiUrl: string;
  link: Link | null;
  outbox: Outbox[];
}

export type Action =
  | {type: 'go'; screen: Screen}
  | {type: 'claim'; kidId: KidId; jobId: string}
  | {type: 'undoClaim'; kidId: KidId; jobId: string}
  | {type: 'decide'; claimId: string; yes: boolean; minutes: number}
  | {type: 'gameDone'; kidId: KidId; marbles: number; gameId: string; total?: number}
  | {type: 'setLang'; lang: Lang}
  | {type: 'setCaps'; caps: boolean}
  | {type: 'setVoice'; voice: boolean}
  | {type: 'setFamily'; family: Family; balances?: Record<KidId, number>}
  | {type: 'celebrated'; kidId: KidId}
  | {type: 'restore'; saved: unknown}
  | {type: 'setApi'; url: string}
  | {type: 'linked'; link: Link}
  | {type: 'unlink'}
  | {type: 'synced'; server: ServerState; at: number}
  | {type: 'sent'; id: string};

export const initialState: State = {
  screen: {name: 'who'},
  lang: 'en',
  family: SAMPLE_FAMILY,
  caps: false,
  voice: true,
  balances: {mia: 35, leo: 20},
  claims: [],
  gameMarblesToday: {mia: 0, leo: 0},
  gameDay: '',
  celebrations: [],
  apiUrl: DEFAULT_API_URL,
  link: null,
  outbox: [],
};

/** A random id the backend accepts as a client UUID (repeats of a request are then harmless). */
export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Queue a change for the backend, if this TV is paired. */
const queue = (state: State, item: Outbox): Outbox[] => (state.link ? [...state.outbox, item] : state.outbox);

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'go':
      return {...state, screen: action.screen};
    case 'claim': {
      if (state.claims.some(c => c.kidId === action.kidId && c.jobId === action.jobId && c.status === 'waiting')) {
        return {...state, screen: {name: 'claimed', kidId: action.kidId, jobId: action.jobId}};
      }
      const claim: Claim = {id: newId(), kidId: action.kidId, jobId: action.jobId, status: 'waiting', at: Date.now()};
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
      const claims = state.claims.map(c => (c.id === claim.id ? {...c, status: action.yes ? 'approved' : 'rejected'} as Claim : c));
      const outbox = queue(state, {kind: 'decide', id: `decide-${claim.id}`, claimId: claim.id, yes: action.yes});
      if (!action.yes) return {...state, claims, outbox};
      return {
        ...state,
        claims,
        outbox,
        balances: {...state.balances, [claim.kidId]: balanceOf(state, claim.kidId) + action.minutes},
        celebrations: [...state.celebrations, {kidId: claim.kidId, marbles: action.minutes / MIN_PER_MARBLE, jobId: claim.jobId}],
      };
    }
    case 'gameDone': {
      const today = localDay(Date.now());
      const counted = state.gameDay === today ? state.gameMarblesToday : {};
      const left = Math.max(0, DAILY_GAME_MARBLES - (counted[action.kidId] ?? 0));
      const marbles = Math.min(left, action.marbles);
      return {
        ...state,
        balances: {...state.balances, [action.kidId]: balanceOf(state, action.kidId) + marbles * MIN_PER_MARBLE},
        gameMarblesToday: {...counted, [action.kidId]: (counted[action.kidId] ?? 0) + marbles},
        gameDay: today,
        outbox: queue(state, {kind: 'game', id: newId(), childId: action.kidId, topic: action.gameId, correct: action.total ?? 3, total: action.total ?? 3, at: Date.now()}),
        screen: {name: 'yay', kidId: action.kidId, marbles, why: marbles > 0 ? {kind: 'game', gameId: action.gameId} : {kind: 'cap'}},
      };
    }
    case 'setLang':
      return {...state, lang: action.lang};
    case 'setCaps':
      return {...state, caps: action.caps};
    case 'setVoice':
      return {...state, voice: action.voice};
    case 'setFamily':
      return {...state, family: action.family, balances: action.balances ?? {}, claims: [], celebrations: [], gameMarblesToday: {}, gameDay: '', screen: {name: 'who'}};
    case 'celebrated':
      return {...state, celebrations: state.celebrations.filter(c => c.kidId !== action.kidId)};
    case 'restore':
      return restore(state, action.saved);
    case 'setApi':
      return {...state, apiUrl: action.url};
    case 'linked':
      return {...state, link: action.link, outbox: []};
    case 'unlink':
      // Back to a TV on its own: sample family, demo PIN.
      return {...initialState, lang: state.lang, caps: state.caps, voice: state.voice, apiUrl: state.apiUrl, screen: {name: 'who'}};
    case 'synced':
      return applyServer(state, action.server, action.at);
    case 'sent':
      return {...state, outbox: state.outbox.filter(o => o.id !== action.id)};
  }
}

const COLORS: Record<string, string> = {peach: colors.peach, mint: colors.mint, sky: colors.sky, lilac: colors.lilac, gold: colors.gold};
const GAMES: Record<string, Omit<Game, 'id'>> = {
  numbers: {topic: 'numbers', title: 'gameNumbers', label: '123', color: colors.sky, marbles: 2},
  words: {topic: 'words', title: 'gameWords', label: 'Abc', color: colors.lilac, marbles: 2},
  puzzles: {topic: 'puzzles', title: 'gamePuzzles', label: '', color: colors.peach, marbles: 2},
};

/** The family as the phone app set it up, in the shapes the TV screens use. Jobs not due today are left out. */
export function familyFromServer(server: ServerState, now: number): Family {
  const weekday = ((new Date(now).getDay() + 6) % 7) + 1; // ISO: Monday = 1
  const due = (repeat: ServerState['chores'][number]['repeat']) => repeat.kind !== 'weekdays' || repeat.days.includes(weekday);
  return {
    kids: server.children.map(c => ({id: c.id, name: c.name, avatar: c.avatar, avatarBg: COLORS[c.color] ?? colors.sky, age: c.age})),
    jobs: Object.fromEntries(
      server.children.map(child => [
        child.id,
        server.chores
          .filter(chore => chore.childIds.includes(child.id) && due(chore.repeat))
          .map((chore): Job => ({id: chore.id, title: chore.title, icon: chore.icon, color: COLORS[chore.color] ?? colors.peach, minutes: chore.minutes, once: chore.repeat.kind === 'once'})),
      ]),
    ),
    games: Object.fromEntries(server.children.map(c => [c.id, c.games.topics.filter(t => GAMES[t]).map(t => ({id: t, ...GAMES[t]}))])),
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
        return {id: c.id, kidId: c.childId, jobId: c.choreId, status, at: c.createdAt};
      }),
    ...state.claims.filter(c => pendingClaims.has(c.id)),
  ];
  const waitingHere = new Set(state.claims.filter(c => c.status === 'waiting').map(c => c.id));
  const approvedElsewhere = server.claims.filter(c => c.status === 'approved' && waitingHere.has(c.id) && !decided.has(c.id));
  return {
    ...state,
    lang: server.family.lang,
    caps: server.family.caps,
    voice: server.family.voice,
    family: familyFromServer(server, now),
    balances: Object.fromEntries(server.children.map(c => [c.id, Math.floor(c.balanceSec / 60)])),
    claims,
    gameMarblesToday: server.gameMarblesToday,
    gameDay: localDay(now),
    celebrations: [...state.celebrations, ...approvedElsewhere.map(c => ({kidId: c.childId, marbles: c.minutes / MIN_PER_MARBLE, jobId: c.choreId}))],
    link: state.link && {...state.link, familyName: server.family.name, pin: server.family.pin},
  };
}

/** Approved today (or ever, for a one-off job): off the board until it's due again. */
export function isDone(state: State, kidId: KidId, job: Job, now = Date.now()): boolean {
  const today = localDay(now);
  return state.claims.some(c => c.kidId === kidId && c.jobId === job.id && c.status === 'approved' && (job.once || localDay(c.at) === today));
}

/** The grown-ups PIN: the family's own once paired, the demo PIN before. */
export function checkPin(state: State, pin: string): boolean {
  const own = state.link?.pin;
  return own ? sha256Hex(`${own.salt}:${pin}`) === own.hash : pin === DEMO_PIN;
}

/** "2026-10-05" in the TV's own time zone: the daily game cap resets at local midnight. */
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
  const family = isRecord(saved.family) && Array.isArray(saved.family.kids) && isRecord(saved.family.jobs) && isRecord(saved.family.games) ? (saved.family as unknown as Family) : state.family;
  return {
    ...state,
    lang: LANGS.some(l => l.id === saved.lang) ? (saved.lang as Lang) : state.lang,
    caps: typeof saved.caps === 'boolean' ? saved.caps : state.caps,
    voice: typeof saved.voice === 'boolean' ? saved.voice : state.voice,
    family,
    balances: isRecord(saved.balances) ? (saved.balances as Record<KidId, number>) : state.balances,
    claims: Array.isArray(saved.claims) ? (saved.claims as Claim[]) : state.claims,
    gameMarblesToday: isRecord(saved.gameMarblesToday) ? (saved.gameMarblesToday as Record<KidId, number>) : state.gameMarblesToday,
    gameDay: typeof saved.gameDay === 'string' ? saved.gameDay : state.gameDay,
    celebrations: Array.isArray(saved.celebrations) ? (saved.celebrations as Celebration[]) : state.celebrations,
    apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl : state.apiUrl,
    link: isRecord(saved.link) && typeof saved.link.token === 'string' ? (saved.link as unknown as Link) : saved.link === null ? null : state.link,
    outbox: Array.isArray(saved.outbox) ? (saved.outbox as Outbox[]) : state.outbox,
  };
}

/** Marbles in the jar. Penalties can take a balance below zero: the jar is then just empty. */
export const marblesIn = (minutes: number) => Math.max(0, Math.floor(minutes / MIN_PER_MARBLE));
export const balanceOf = (state: State, kidId: KidId) => state.balances[kidId] ?? 0;
