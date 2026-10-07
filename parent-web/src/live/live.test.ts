import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {backoffMs, CHANGED_DEBOUNCE_MS, parseMessage, PING_MS, PONG_WAIT_MS, socketUrl, startLive, type SocketLike} from './live';

describe('messages', () => {
  it('knows "changed" and "pong", and ignores everything else', () => {
    expect(parseMessage('{"type":"changed"}')).toBe('changed');
    expect(parseMessage('{"type":"pong"}')).toBe('pong');
    expect(parseMessage('{"type":"hello"}')).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('null')).toBeNull();
    expect(parseMessage(new ArrayBuffer(2))).toBeNull();
  });
});

describe('socket address', () => {
  it('adds the token, also after other query parameters', () => {
    expect(socketUrl('wss://rt.example/live', 'a.b.c')).toBe('wss://rt.example/live?token=a.b.c');
    expect(socketUrl('wss://rt.example/live?x=1', 'tok')).toBe('wss://rt.example/live?x=1&token=tok');
  });
});

describe('reconnect backoff', () => {
  const noJitter = () => 0.5;

  it('doubles from 1 s and stops growing at 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(attempt => backoffMs(attempt, noJitter))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('spreads retries by up to a fifth either way', () => {
    expect(backoffMs(2, () => 0)).toBe(3200);
    expect(backoffMs(2, () => 1)).toBe(4800);
  });
});

/** A WebSocket the test drives by hand. */
class FakeSocket implements SocketLike {
  static made: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({data});
  }
}

function start(tokens: (string | null)[] = ['tok']) {
  FakeSocket.made = [];
  const onChanged = vi.fn();
  const connected: boolean[] = [];
  const stop = startLive({
    url: 'wss://rt.example/live',
    getToken: async () => (tokens.length > 1 ? tokens.shift()! : tokens[0]),
    onChanged,
    onConnectedChange: value => connected.push(value),
    createSocket: url => new FakeSocket(url),
    random: () => 0.5,
  });
  const socket = (i = FakeSocket.made.length - 1) => FakeSocket.made[i];
  return {onChanged, connected, stop, socket};
}

/** Lets the token arrive and any due timers run. */
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('live connection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects with the token, and fetches once for a burst of "changed"', async () => {
    const live = start();
    await tick();
    expect(live.socket().url).toBe('wss://rt.example/live?token=tok');
    live.socket().open();
    expect(live.connected).toEqual([true]);

    live.socket().receive('{"type":"changed"}');
    live.socket().receive('{"type":"changed"}');
    live.socket().receive('{"type":"pong"}');
    expect(live.onChanged).not.toHaveBeenCalled();
    await tick(CHANGED_DEBOUNCE_MS);
    expect(live.onChanged).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('doesn’t fetch on the first connection (the screen just loaded)', async () => {
    const live = start();
    await tick();
    live.socket().open();
    await tick(CHANGED_DEBOUNCE_MS * 4);
    expect(live.onChanged).not.toHaveBeenCalled();
    live.stop();
  });

  it('pings every five minutes while the connection is open', async () => {
    const live = start();
    await tick();
    live.socket().open();
    await tick(PING_MS * 2);
    expect(live.socket().sent).toEqual(['{"type":"ping"}', '{"type":"ping"}']);
    live.stop();
  });

  it('reconnects after a drop with growing waits, then fetches what it missed', async () => {
    const live = start();
    await tick();
    live.socket(0).open();
    live.socket(0).close();
    expect(live.connected).toEqual([true, false]);

    await tick(999);
    expect(FakeSocket.made).toHaveLength(1);
    await tick(1); // 1 s
    expect(FakeSocket.made).toHaveLength(2);

    live.socket(1).close(); // refused before it opened
    await tick(2000); // 2 s
    expect(FakeSocket.made).toHaveLength(3);

    live.socket(2).open();
    expect(live.connected.at(-1)).toBe(true);
    await tick(CHANGED_DEBOUNCE_MS);
    expect(live.onChanged).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('waits and tries again while there is no token', async () => {
    const live = start([null, 'tok']);
    await tick();
    expect(FakeSocket.made).toHaveLength(0);
    await tick(1000);
    expect(live.socket().url).toContain('token=tok');
    live.stop();
  });

  it('reconnects at once when the phone wakes up with the connection gone', async () => {
    const page = Object.assign(new EventTarget(), {visibilityState: 'visible'});
    vi.stubGlobal('document', page);
    vi.stubGlobal('window', new EventTarget());
    const live = start();
    await tick();
    live.socket(0).open();
    live.socket(0).close(); // the next try would be in 1 s

    page.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(FakeSocket.made).toHaveLength(2);
    live.stop();
  });

  it('after waking, drops a connection that doesn’t answer a ping', async () => {
    const page = Object.assign(new EventTarget(), {visibilityState: 'visible'});
    vi.stubGlobal('document', page);
    vi.stubGlobal('window', new EventTarget());
    const live = start();
    await tick();
    live.socket().open();

    page.dispatchEvent(new Event('visibilitychange'));
    expect(live.socket().sent).toEqual(['{"type":"ping"}']);
    await tick(CHANGED_DEBOUNCE_MS);
    expect(live.onChanged).toHaveBeenCalledTimes(1); // it may have missed something while asleep
    await tick(PONG_WAIT_MS);
    expect(live.socket(0).readyState).toBe(3);
    expect(live.connected.at(-1)).toBe(false);
    live.stop();
  });

  it('stops for good', async () => {
    const live = start();
    await tick();
    live.socket().open();
    live.stop();
    expect(live.socket().readyState).toBe(3);
    await tick(60_000);
    expect(FakeSocket.made).toHaveLength(1);
  });
});
