import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {api, ApiError} from './api';
import {Outbox, useStore} from './state';

const APP_VERSION = '0.1.0';
const ON_SCREEN_MS = 3000;
const AWAY_MS = 30000;
const HEARTBEAT_MS = 60000;

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
    case 'game':
      return api.gameResult(base, token, {id: item.id, childId: item.childId, topic: item.topic, correct: item.correct, total: item.total, at: item.at});
  }
}

/**
 * Keeps a paired TV in step with the backend: sends the outbox in order, then polls the family's state
 * (every 3 s on screen, 30 s in the background, at once when something new is waiting to be sent).
 * Offline, the TV keeps working on its own and the outbox waits.
 */
export function SyncLoop() {
  const {state, dispatch} = useStore();
  const latest = useRef(state);
  latest.current = state;
  const kick = useRef<() => void>(() => {});
  const token = state.link?.token;

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
        if (!stopped) timer = setTimeout(tick, AppState.currentState === 'active' ? ON_SCREEN_MS : AWAY_MS);
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

  // Send a new claim, decision or game result right away rather than at the next tick.
  const waiting = state.outbox.length;
  useEffect(() => {
    if (waiting) kick.current();
  }, [waiting]);

  return null;
}
