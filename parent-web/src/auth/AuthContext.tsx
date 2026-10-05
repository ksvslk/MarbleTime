import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import type {Config} from '../config';
import {createAuth, type Auth} from './auth';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  auth: Auth;
  status: Status;
  /** Email (Cognito) or name (dev) of who is signed in. */
  label: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({config, children}: {config: Config; children: ReactNode}) {
  const auth = useMemo(() => createAuth(config), [config]);
  const [state, setState] = useState<{status: Status; label: string}>({status: 'loading', label: ''});

  useEffect(() => {
    let alive = true;
    const check = () =>
      auth.session().then(session => {
        if (alive) setState(session ? {status: 'signedIn', label: session.label} : {status: 'signedOut', label: ''});
      });
    void check();
    const unsubscribe = auth.subscribe(() => void check());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [auth]);

  const value = useMemo(() => ({auth, ...state}), [auth, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
