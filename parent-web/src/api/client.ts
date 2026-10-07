import type {
  AdjustInput,
  ApiErrorBody,
  Balance,
  Character,
  CharacterInput,
  Child,
  ChildInput,
  ChildPatch,
  Chore,
  ChoreInput,
  ChorePatch,
  Claim,
  ClaimStatus,
  Device,
  DevicePatch,
  Family,
  FamilyBundle,
  FamilyCreate,
  FamilyPatch,
  Handoff,
  HandoffMark,
  LedgerEntry,
  Me,
  MePatch,
  PairingConfirm,
  PushSubscriptionInput,
  PushUnsubscribe,
} from './types';

/** A failed call: the contract's `{"error": {code, message}}`, or a stand-in when there was no such body. */
export class ApiError extends Error {
  /** HTTP status; 0 when no response came back (offline, DNS, CORS). */
  readonly status: number;
  /** The server's error code (e.g. `not_found`), or `network` / `http_<status>` / `bad_response`. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiOptions {
  baseUrl: string;
  /** The parent's bearer token: a Cognito access token, or `dev-<name>` against the local dev server. */
  getToken: () => Promise<string | null>;
  /** Called on a 401. Resolve true when a fresh token is ready; the call is then tried once more. */
  onUnauthorized?: () => Promise<boolean>;
  /** For tests. */
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A request body sent as it is (audio), not as JSON. */
class RawBody {
  readonly data: Blob;
  readonly type: string;
  constructor(data: Blob, type: string) {
    this.data = data;
    this.type = type;
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body?.error && typeof body.error.code === 'string') {
      return new ApiError(res.status, body.error.code, body.error.message ?? '');
    }
  } catch {
    // Not JSON (a proxy's error page, an empty body): fall back to the status.
  }
  return new ApiError(res.status, `http_${res.status}`, res.statusText || `HTTP ${res.status}`);
}

/** One function per endpoint of backend/openapi.yaml that the parent app uses. */
export function createApi(options: ApiOptions) {
  const base = options.baseUrl.replace(/\/+$/, '');
  const send = (url: string, init: RequestInit) => (options.fetch ?? fetch)(url, init);

  async function call<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
    const token = await options.getToken();
    const headers: Record<string, string> = {Accept: 'application/json'};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof RawBody) {
      headers['Content-Type'] = body.type;
      payload = body.data;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await send(base + path, {method, headers, body: payload});
    } catch (e) {
      throw new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
    }
    if (res.status === 401 && !retried && options.onUnauthorized && (await options.onUnauthorized())) {
      return call<T>(method, path, body, true);
    }
    if (!res.ok) throw await errorFrom(res);

    const text = res.status === 204 ? '' : await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'bad_response', 'The response was not JSON');
    }
  }

  const id = encodeURIComponent;
  return {
    me: () => call<Me>('GET', '/me'),
    /** The grown-up's name as kids see it on the TV ("– Dad"). */
    patchMe: (body: MePatch) => call<Me>('PATCH', '/me', body),
    createFamily: (body: FamilyCreate) => call<Family>('POST', '/family', body),
    family: () => call<FamilyBundle>('GET', '/family'),
    patchFamily: (body: FamilyPatch) => call<Family>('PATCH', '/family', body),

    addChild: (body: ChildInput) => call<Child>('POST', '/children', body),
    patchChild: (childId: string, body: ChildPatch) => call<Child>('PATCH', `/children/${id(childId)}`, body),
    removeChild: (childId: string) => call<void>('DELETE', `/children/${id(childId)}`),
    adjust: (childId: string, body: AdjustInput) => call<Balance>('POST', `/children/${id(childId)}/adjust`, body),
    ledger: async (childId: string, limit = 50) =>
      (await call<{entries: LedgerEntry[]}>('GET', `/children/${id(childId)}/ledger?limit=${limit}`)).entries,
    /** The kid's characters, newest first (drawing, ready or needs_help). */
    characters: async (childId: string) => (await call<{characters: Character[]}>('GET', `/children/${id(childId)}/characters`)).characters,
    /** 202 with the character drawing; 422 `idea_not_ok` (a kind sentence to read to the kid), 409 `no_tokens`. */
    addCharacter: (childId: string, body: CharacterInput) => call<Character>('POST', `/children/${id(childId)}/characters`, body),
    removeCharacter: (childId: string, characterId: string) => call<void>('DELETE', `/children/${id(childId)}/characters/${id(characterId)}`),
    /** The kid's words from a recording: 16 kHz mono 16-bit PCM WAV, at most 15 s (lib/wav.ts). "" when nothing was heard. */
    speechToText: async (wav: Blob) => (await call<{text: string}>('POST', '/speech-to-text', new RawBody(wav, 'audio/wav'))).text,
    handoff: (childId: string) => call<Handoff>('GET', `/children/${id(childId)}/handoff`),
    markHandoff: (childId: string, body: HandoffMark) => call<Handoff>('POST', `/children/${id(childId)}/handoff`, body),

    addChore: (body: ChoreInput) => call<Chore>('POST', '/chores', body),
    patchChore: (choreId: string, body: ChorePatch) => call<Chore>('PATCH', `/chores/${id(choreId)}`, body),
    removeChore: (choreId: string) => call<void>('DELETE', `/chores/${id(choreId)}`),

    claims: async (status?: ClaimStatus) =>
      (await call<{claims: Claim[]}>('GET', status ? `/claims?status=${status}` : '/claims')).claims,
    approve: (claimId: string) => call<Claim>('POST', `/claims/${id(claimId)}/approve`),
    reject: (claimId: string) => call<Claim>('POST', `/claims/${id(claimId)}/reject`),

    confirmPairing: (code: string, body: PairingConfirm) => call<Device>('POST', `/pairings/${id(code)}/confirm`, body),
    devices: async () => (await call<{devices: Device[]}>('GET', '/devices')).devices,
    patchDevice: (deviceId: string, body: DevicePatch) => call<Device>('PATCH', `/devices/${id(deviceId)}`, body),
    removeDevice: (deviceId: string) => call<void>('DELETE', `/devices/${id(deviceId)}`),

    /** Web Push: the server's public (VAPID) key, and this browser's subscription in or out. */
    pushKey: async () => (await call<{publicKey: string}>('GET', '/push/key')).publicKey,
    addPushSubscription: (body: PushSubscriptionInput) => call<void>('POST', '/push/subscriptions', body),
    removePushSubscription: (body: PushUnsubscribe) => call<void>('DELETE', '/push/subscriptions', body),
  };
}

export type Api = ReturnType<typeof createApi>;
