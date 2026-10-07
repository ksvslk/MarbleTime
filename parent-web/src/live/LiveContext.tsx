import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {useAuth} from '../auth/AuthContext';
import {startLive} from './live';

interface Live {
  /** The live connection is up: screens can poll slowly. */
  connected: boolean;
  subscribe: (listener: () => void) => () => void;
}

const LiveContext = createContext<Live>({connected: false, subscribe: () => () => undefined});

/** Keeps one live connection open while a family is signed in. Without an address the app just polls, as before. */
export function LiveProvider({url, children}: {url?: string; children: ReactNode}) {
  const {auth} = useAuth();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<() => void>());

  useEffect(() => {
    if (!url) return;
    return startLive({
      url,
      getToken: () => auth.getToken(),
      onChanged: () => listeners.current.forEach(listener => listener()),
      onConnectedChange: setConnected,
    });
  }, [url, auth]);

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);
  const value = useMemo(() => ({connected, subscribe}), [connected, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

/** Runs `onChanged` whenever the server says something in the family changed. */
export function useOnChanged(onChanged: () => void) {
  const {subscribe} = useLive();
  const latest = useRef(onChanged);
  useEffect(() => {
    latest.current = onChanged;
  });
  useEffect(() => subscribe(() => latest.current()), [subscribe]);
}
