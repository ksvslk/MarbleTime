/**
 * The backend as the TV sees it: the device routes of backend/openapi.yaml. Plain fetch, no React Native,
 * so it runs the same on Fire OS and Vega (and in tests).
 */
import type {JobIconName} from './data';
import type {Lang} from './i18n';

export type ColorName = 'peach' | 'mint' | 'sky' | 'lilac' | 'gold';
export type Topic = 'numbers' | 'words' | 'puzzles';

export interface ServerChild {
  id: string;
  name: string;
  avatar: 'bear' | 'bunny';
  color: ColorName;
  age: number;
  balanceSec: number;
  dailyBaseMin?: number;
  games: {topics: Topic[]; dailyCapMarbles: number};
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
}

/** GET /device/state */
export interface ServerState {
  family: {id: string; name: string; lang: Lang; caps: boolean; voice: boolean; pin: {salt: string; hash: string} | null};
  children: ServerChild[];
  chores: ServerChore[];
  claims: ServerClaim[];
  adjustments?: ServerAdjustment[];
  device?: {id: string; name: string; mode: 'amazon_kids' | 'strict' | 'api_mock'};
  gameMarblesToday: Record<string, number>;
  today: string;
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
}

/** One request with a timeout. Network trouble throws a plain Error; an answer with an error status throws ApiError. */
async function call<T>(base: string, path: string, {method = 'GET', token, body, etag}: Call): Promise<{status: number; data?: T; etag?: string}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
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

  undo: (base: string, token: string, claimId: string) => call(base, `/device/claims/${claimId}`, {method: 'DELETE', token}),

  decide: (base: string, token: string, claimId: string, yes: boolean, pin: string) =>
    call<ServerClaim>(base, `/device/claims/${claimId}/decide`, {method: 'POST', token, body: {yes, pin}}),

  gameResult: (base: string, token: string, result: {id: string; childId: string; topic: string; correct: number; total: number; at: number}) =>
    call<{marbles: number; balanceSec: number}>(base, '/device/games/results', {method: 'POST', token, body: result}),

  heartbeat: (base: string, token: string, appVersion: string) => call(base, '/device/heartbeat', {method: 'POST', token, body: {appVersion}}),
};
