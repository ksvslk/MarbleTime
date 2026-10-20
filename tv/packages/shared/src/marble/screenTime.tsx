import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {screenTimeKid, useStore} from './state';

/** Time is taken out of the jar a minute at a time, and whatever is left when the kid leaves the screen. */
const STEP_MS = 60_000;

/**
 * Counts the time a kid spends on MarbleTime's own screen time (puzzles, playing with their characters) and takes
 * it out of their jar, on every build: these screens are in front, so the app can count by itself. Time stops while
 * the TV sleeps or another app is in front.
 */
export function ScreenTime() {
  const {state, dispatch} = useStore();
  const kidId = screenTimeKid(state.screen);
  const since = useRef(0);
  useEffect(() => {
    if (!kidId) return;
    since.current = Date.now();
    const flush = () => {
      const seconds = since.current ? (Date.now() - since.current) / 1000 : 0;
      since.current = AppState.currentState === 'active' ? Date.now() : 0;
      // A gap longer than a few steps is a sleep, not a kid at the screen.
      if (seconds >= 1 && seconds <= (3 * STEP_MS) / 1000) dispatch({type: 'watched', kidId, seconds});
    };
    const timer = setInterval(flush, STEP_MS);
    const sub = AppState.addEventListener('change', flush);
    return () => {
      clearInterval(timer);
      sub.remove();
      flush();
    };
  }, [kidId, dispatch]);
  return null;
}
