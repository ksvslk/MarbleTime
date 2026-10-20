/**
 * The backend as the TV sees it: the device routes of backend/openapi.yaml. Plain fetch, no React Native,
 * so it runs the same on Fire OS and Vega (and in tests).
 */
import type {JobIconName} from './data';
import type {Lang} from './i18n';

export type ColorName = 'peach' | 'mint' | 'sky' | 'lilac' | 'gold';

export interface ServerChild {
  id: string;
  name: string;
  avatar: 'bear' | 'bunny';
  color: ColorName;
  age: number;
  balanceSec: number;
  dailyBaseMin?: number;
  /** The daily ceiling: the jar's size (missing on a backend from before it existed). */
  dailyMaxMin?: number;
  characterTokens?: number;
  /** TV watched today and the time left today (missing on a backend from before watched time was counted). */
  usedTodaySec?: number;
  leftTodaySec?: number;
  /** Puzzles: stars toward the next character, today's session, the kid's levels (missing on a backend from before puzzles). */
  puzzles?: {on: boolean; stars: number; starsNeeded: number; doneToday: boolean; levels: Record<string, number>};
  /** When TV time ends for the night (absent: none). */
  bedtime?: {from: string; to: string};
}

/** Gemini-TTS voices, picked by the backend's art director. */
export type CharacterVoice = 'Puck' | 'Zephyr' | 'Fenrir' | 'Leda' | 'Aoede' | 'Laomedeia' | 'Achird' | 'Sadachbia' | 'Autonoe' | 'Algenib' | 'Achernar' | 'Vindemiatrix';
export type CharacterMood = 'happy' | 'silly' | 'brave' | 'sleepy' | 'proud' | 'curious' | 'calm';

/** A kid's character as GET /device/state lists it; its art comes from GET /device/characters/{id} once ready. */
export interface ServerCharacter {
  id: string;
  childId: string;
  status: 'drawing' | 'ready';
  name?: string;
  voice?: CharacterVoice;
  mood?: CharacterMood;
  createdAt: number;
}

export type CharacterPart = 'body' | 'head' | 'eye-left' | 'eye-right' | 'mouth' | 'arm-left' | 'arm-right' | 'legs' | 'extra';

/** A ready character's art: layers in drawing order, each a complete small SVG with the same viewBox. Never changes. */
export interface CharacterArt {
  id: string;
  name?: string;
  voice: CharacterVoice;
  viewBox: string;
  /** parent: the named part this layer was drawn inside and moves with (eyes on the head, a held thing on an arm). */
  layers: {part?: CharacterPart; parent?: CharacterPart; pivot?: [number, number]; svg: string}[];
}

/** A line a character says (Gemini voice, WAV), with how open the mouth is every stepMs (0–1). */
export interface Speech {
  audioUrl: string;
  durationMs: number;
  mouth?: {stepMs: number; open: number[]};
  /** Older speech (and voices that give them): viseme marks, ms from the start. */
  visemes?: {time: number; value: string}[];
}

/** A bonus (+) or taken-away (−) minutes, with the parent's reason. */
export interface ServerAdjustment {
  id: string;
  childId: string;
  deltaMin: number;
  reason: string;
  at: number;
}

export type Repeat = {kind: 'daily'} | {kind: 'weekdays'; days: number[]} | {kind: 'once'};

export interface ServerChore {
  id: string;
  title: string;
  icon: JobIconName;
  color: ColorName;
  minutes: number;
  repeat: Repeat;
  childIds: string[];
  routine?: boolean;
}

export interface ServerClaim {
  id: string;
  childId: string;
  choreId: string;
  status: 'waiting' | 'approved' | 'rejected';
  minutes: number;
  createdAt: number;
  decidedAt?: number;
  decidedBy?: 'parent' | 'tv';
  approverName?: string;
  /** What the job card showed at "I did it!", and so what a yes gives. */
  promised?: {reward: 'marbles' | 'character' | 'praise'; minutes: number};
  reward?: 'marbles' | 'character' | 'praise';
  minutesCredited?: number;
  notYetReason?: NotYetReason;
}

/** One puzzle as the backend sends it (Puzzle in backend/openapi.yaml): written by a model ahead of time and checked. */
export interface ServerPuzzle {
  id: string;
  subject: string;
  level: number;
  prompt: string;
  /** Emoji the question is about, shown in a row. */
  picture: string[];
  /** Three answers, all words or all emoji. */
  choices: {text?: string; emoji?: string}[];
  answer: number;
  reason: string;
}

/** Why a grown-up said "not yet" (NotYetReason in backend/openapi.yaml). */
export type NotYetReason = 'not_finished' | 'together' | 'later';
export const NOT_YET_REASONS: NotYetReason[] = ['not_finished', 'together', 'later'];

/** GET /device/state */
export interface ServerState {
  family: {id: string; name: string; lang: Lang; caps: boolean; voice: boolean; pin: {salt: string; hash: string} | null};
  children: ServerChild[];
  chores: ServerChore[];
  claims: ServerClaim[];
  adjustments?: ServerAdjustment[];
  device?: {id: string; name: string; mode: 'amazon_kids' | 'strict' | 'api_mock'};
  characters?: ServerCharacter[];
  today: string;
  /** wss:// address for live updates. */
  realtimeUrl?: string;
  serverTime: number;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Call {
  method?: 'GET' | 'POST' | 'DELETE';
  token?: string;
  body?: unknown;
  etag?: string;
  /** How long the answer may take (default 8 s). */
  timeoutMs?: number;
}

/** One request with a timeout. Network trouble throws a plain Error; an answer with an error status throws ApiError. */
async function call<T>(base: string, path: string, {method = 'GET', token, body, etag, timeoutMs = 8000}: Call): Promise<{status: number; data?: T; etag?: string}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {Accept: 'application/json'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Device ${token}`;
    if (etag) headers['If-None-Match'] = etag;
    const response = await fetch(base.replace(/\/+$/, '') + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal});
    if (response.status === 304 || response.status === 204) return {status: response.status};
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!response.ok) throw new ApiError(response.status, data?.error?.code ?? 'error', data?.error?.message ?? `HTTP ${response.status}`);
    return {status: response.status, data: data as T, etag: response.headers.get('ETag') ?? undefined};
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  createPairing: async (base: string, platform: 'fireos' | 'vega' | 'web') =>
    (await call<{code: string; expiresAt: number; pairUrl: string}>(base, '/pairings', {method: 'POST', body: {platform}})).data!,

  pairingStatus: async (base: string, code: string) =>
    (await call<{status: 'waiting' | 'paired' | 'expired'; deviceToken?: string; deviceId?: string}>(base, `/pairings/${code}`, {})).data!,

  /** null when nothing changed since `etag`. */
  state: async (base: string, token: string, etag?: string) => {
    const result = await call<ServerState>(base, '/device/state', {token, etag});
    return result.status === 304 ? null : {state: result.data!, etag: result.etag};
  },

  claim: (base: string, token: string, claim: {id: string; childId: string; choreId: string; at: number}) =>
    call<ServerClaim>(base, '/device/claims', {method: 'POST', token, body: claim}),

  /**
   * A kid's new character from their own words, said or typed on the TV (uses one character token). The art director
   * answers inside the call, which can take a while; a no is ApiError 422 with a kind sentence to show the kid.
   */
  createCharacter: (base: string, token: string, childId: string, description: string) =>
    call<ServerCharacter>(base, `/device/children/${encodeURIComponent(childId)}/characters`, {method: 'POST', token, body: {description}, timeoutMs: 40000}),

  /** Time a kid spent on MarbleTime's own screen time (puzzles, their characters), in seconds: it comes out of their jar. */
  usage: (base: string, token: string, usage: {id: string; childId: string; seconds: number}) =>
    call<ServerChild>(base, '/device/usage', {method: 'POST', token, body: usage}),

  /** A kid's next puzzle session (the one written for them, or one from the bank); null when there is none to play. */
  puzzleSession: (base: string, token: string, childId: string) =>
    call<{questions: ServerPuzzle[]; spare?: ServerPuzzle}>(base, `/device/puzzles/session?childId=${encodeURIComponent(childId)}`, {token}).then(answer => answer.data ?? null),

  /** A finished puzzle session: the kid's first answer to each puzzle. */
  puzzleResult: (base: string, token: string, result: {id: string; childId: string; answers: {id: string; right: boolean}[]}) =>
    call<ServerChild>(base, '/device/puzzles/results', {method: 'POST', token, body: result}),

  undo: (base: string, token: string, claimId: string) => call(base, `/device/claims/${claimId}`, {method: 'DELETE', token}),

  decide: (base: string, token: string, claimId: string, yes: boolean, pin: string, reason?: NotYetReason) =>
    call<ServerClaim>(base, `/device/claims/${claimId}/decide`, {method: 'POST', token, body: {yes, pin, ...(reason && {reason})}}),

  /** Grown-ups changed settings on the TV (checked with the family PIN). */
  settings: (base: string, token: string, settings: {lang?: Lang; caps?: boolean; voice?: boolean}, pin: string) =>
    call(base, '/device/settings', {method: 'POST', token, body: {pin, ...settings}}),

  heartbeat: (base: string, token: string, appVersion: string) => call(base, '/device/heartbeat', {method: 'POST', token, body: {appVersion}}),

  /** A ready character's art (cache it: it never changes). */
  characterArt: async (base: string, token: string, id: string) =>
    (await call<CharacterArt>(base, `/device/characters/${encodeURIComponent(id)}`, {token})).data!,

  /** Audio and mouth timings for a short pre-written line (the backend caches each text + voice). */
  /** A character says it in its own voice and style (the backend knows them); without characterId, the narrator. */
  speech: async (base: string, token: string, line: {text: string; lang: Lang; characterId?: string}) =>
    (await call<Speech>(base, '/device/speech', {method: 'POST', token, body: line})).data!,
};
