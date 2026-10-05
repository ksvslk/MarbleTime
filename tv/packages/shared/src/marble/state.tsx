import React, {createContext, useContext, useEffect, useMemo, useReducer, useState} from 'react';
import {Action, initialState, reducer, State, toSaved} from './logic';
import {Storage} from './storage';

export * from './logic';

const Ctx = createContext<{state: State; dispatch: React.Dispatch<Action>} | null>(null);

/** The app's state. It is saved on the device after every change and loaded back before the first screen shows. */
export function StoreProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Never keep the TV blank for long, even if storage misbehaves.
    const fallback = setTimeout(() => setLoaded(true), 1500);
    Storage.load()
      .then(raw => raw && dispatch({type: 'restore', saved: JSON.parse(raw)}))
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallback);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => Storage.save(JSON.stringify(toSaved(state))).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [state, loaded]);

  const value = useMemo(() => ({state, dispatch}), [state]);
  return <Ctx.Provider value={value}>{loaded ? children : null}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStore outside StoreProvider');
  return value;
}
