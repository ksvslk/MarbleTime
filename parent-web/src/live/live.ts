/**
 * Live updates (`x-realtime` in backend/openapi.yaml): one WebSocket per open app, `?token=<parent token>`.
 * The server says {"type": "changed"} whenever anything in the family changes, and the app fetches what it
 * shows. Polling stays as a slower fallback, since a phone can drop the connection at any time.
 */

/** Keeps the connection from idling out (API Gateway closes it after 10 quiet minutes). */
export const PING_MS = 5 * 60 * 1000;
/** After waking up, a connection that doesn't answer a ping this fast is dead (the phone slept through it). */
export const PONG_WAIT_MS = 10 * 1000;
/** Changes arrive in bursts (a decision moves a claim, a balance and the ledger): one fetch per burst. */
export const CHANGED_DEBOUNCE_MS = 250;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30 * 1000;

/** What a message from the server means; anything else is ignored. */
export function parseMessage(data: unknown): 'changed' | 'pong' | null {
  if (typeof data !== 'string') return null;
  try {
    const type = (JSON.parse(data) as {type?: unknown} | null)?.type;
    return type === 'changed' || type === 'pong' ? type : null;
  } catch {
    return null;
  }
}

/** The socket address with the parent's token, which ties the connection to their family. */
export function socketUrl(base: string, token: string): string {
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * How long to wait before reconnect attempt n (0, 1, 2, …): 1 s, 2 s, 4 s … up to 30 s, give or take a fifth,
 * so a family's phones don't all knock at once after an outage.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** The part of a WebSocket this uses (a fake one in tests). */
export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: {data: unknown}) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

const OPEN = 1;

export interface LiveOptions {
  url: string;
  /** The parent's current token; null (signed out) means try again later. */
  getToken: () => Promise<string | null>;
  /** The family changed: fetch what's on screen. */
  onChanged: () => void;
  onConnectedChange: (connected: boolean) => void;
  createSocket?: (url: string) => SocketLike;
  random?: () => number;
}

/** Connects and keeps reconnecting until the returned function is called. */
export function startLive(options: LiveOptions): () => void {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  let socket: SocketLike | null = null;
  let connecting = false;
  let attempt = 0;
  let everOpen = false;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let changedTimer: ReturnType<typeof setTimeout> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const changed = () => {
    clearTimeout(changedTimer);
    changedTimer = setTimeout(options.onChanged, CHANGED_DEBOUNCE_MS);
  };

  const retryLater = () => {
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void connect(), backoffMs(attempt++, options.random));
  };

  const ping = (ws: SocketLike) => {
    if (ws.readyState === OPEN) ws.send(JSON.stringify({type: 'ping'}));
  };

  async function connect() {
    clearTimeout(retryTimer);
    if (stopped || socket || connecting) return;
    connecting = true;
    const token = await options.getToken().catch(() => null);
    connecting = false;
    if (stopped || socket) return;
    if (!token) {
      retryLater();
      return;
    }

    const ws = createSocket(socketUrl(options.url, token));
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      options.onConnectedChange(true);
      // Changes made while the connection was down sent nothing: fetch once after a reconnect.
      if (everOpen) changed();
      everOpen = true;
      pingTimer = setInterval(() => ping(ws), PING_MS);
    };
    ws.onmessage = event => {
      const message = parseMessage(event.data);
      if (message === 'changed') changed();
      if (message === 'pong') clearTimeout(pongTimer);
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      if (socket !== ws) return;
      socket = null;
      options.onConnectedChange(false);
      retryLater();
    };
    // A failed connection also closes; closing here covers browsers that only report the error.
    ws.onerror = () => ws.close();
  }

  // Back on screen or back online: reconnect now if the connection is gone, or check it still answers
  // (a phone may sleep through a dropped connection), and fetch in case something changed meanwhile.
  const wake = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    if (socket?.readyState === OPEN) {
      const ws = socket;
      ping(ws);
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => ws.close(), PONG_WAIT_MS);
      changed();
    } else if (!socket) {
      attempt = 0;
      void connect();
    }
  };
  const canListen = typeof document !== 'undefined' && typeof window !== 'undefined';
  if (canListen) {
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
  }

  void connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(changedTimer);
    clearTimeout(pongTimer);
    clearInterval(pingTimer);
    if (canListen) {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    }
    const ws = socket;
    socket = null;
    ws?.close();
  };
}
