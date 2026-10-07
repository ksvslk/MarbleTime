import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {api, ApiError} from './api';
import {Outbox, useStore} from './state';

const APP_VERSION = '0.1.0';
const ON_SCREEN_MS = 3000;
/** With the live connection up, polling is only a safety net. */
const LIVE_MS = 15000;
const AWAY_MS = 30000;
const HEARTBEAT_MS = 60000;
/** API Gateway closes a silent WebSocket after 10 minutes. */
const PING_MS = 5 * 60 * 1000;

/** The PIN a grown-up typed on this TV, for decisions they make here. Kept in memory only, never saved. */
export const session = {pin: ''};

function send(base: string, token: string, item: Outbox) {
  switch (item.kind) {
    case 'claim':
      return api.claim(base, token, {id: item.id, childId: item.childId, choreId: item.choreId, at: item.at});
    case 'undo':
      return api.undo(base, token, item.claimId);
    case 'decide':
      return api.decide(base, token, item.claimId, item.yes, session.pin);
    case 'settings':
      return api.settings(base, token, {lang: item.lang, caps: item.caps, voice: item.voice}, session.pin);
  }
}

/**
 * Keeps a paired TV in step with the backend: sends the outbox in order, then fetches the family's state
 * the moment the backend says something changed (live WebSocket), and polls as a safety net (every 15 s
 * with the live connection up, 3 s without it, 30 s in the background). Offline, the TV keeps working on its
 * own and the outbox waits.
 */
export function SyncLoop() {
  const {state, dispatch} = useStore();
  const latest = useRef(state);
  latest.current = state;
  const kick = useRef<() => void>(() => {});
  const live = useRef(false);
  const token = state.link?.token;
  const realtimeUrl = state.link?.realtimeUrl;

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let etag: string | undefined;
    let lastBeat = 0;

    const tick = async () => {
      if (running || stopped) return;
      running = true;
      clearTimeout(timer);
      const base = latest.current.apiUrl;
      try {
        for (const item of latest.current.outbox) {
          try {
            await send(base, token, item);
          } catch (error) {
            // A refusal (already done today, decided on the phone…) is final; the state below shows the truth.
            // No network, a busy backend (429, 5xx) or an unknown TV (401) stops here; tried again next time.
            if (!(error instanceof ApiError) || error.status === 401 || error.status === 429 || error.status >= 500) throw error;
          }
          dispatch({type: 'sent', id: item.id});
        }
        if (Date.now() - lastBeat > HEARTBEAT_MS) {
          lastBeat = Date.now();
          api.heartbeat(base, token, APP_VERSION).catch(() => {});
        }
        const fresh = await api.state(base, token, etag);
        if (fresh && !stopped) {
          etag = fresh.etag;
          dispatch({type: 'synced', server: fresh.state, at: Date.now()});
        }
      } catch (error) {
        // The phone app removed this TV.
        if (error instanceof ApiError && error.status === 401) dispatch({type: 'unlink'});
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(tick, AppState.currentState !== 'active' ? AWAY_MS : live.current ? LIVE_MS : ON_SCREEN_MS);
      }
    };

    kick.current = tick;
    tick();
    const sub = AppState.addEventListener('change', next => next === 'active' && tick());
    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
      kick.current = () => {};
    };
  }, [token, dispatch]);

  // The live connection: "changed" from the backend means fetch now (a parent said yes, a bonus, new questions…).
  useEffect(() => {
    if (!token || !realtimeUrl) return;
    let socket: WebSocket | undefined;
    let stopped = false;
    let retries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const connect = () => {
      socket = new WebSocket(`${realtimeUrl}?device=${encodeURIComponent(token)}`);
      socket.onopen = () => {
        retries = 0;
        live.current = true;
        kick.current(); // catch up on anything missed while disconnected
        ping = setInterval(() => socket?.send(JSON.stringify({type: 'ping'})), PING_MS);
      };
      socket.onmessage = event => {
        try {
          if (JSON.parse(String(event.data)).type === 'changed') kick.current();
        } catch {
          // Not for us.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        live.current = false;
        clearInterval(ping);
        if (!stopped) retry = setTimeout(connect, Math.min(60000, 1000 * 2 ** retries++));
      };
    };
    connect();
    return () => {
      stopped = true;
      live.current = false;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [token, realtimeUrl]);

  // Send a new claim, decision or game result right away rather than at the next tick.
  const waiting = state.outbox.length;
  useEffect(() => {
    if (waiting) kick.current();
  }, [waiting]);

  return null;
}
