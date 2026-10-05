import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {useAuth} from '../auth/AuthContext';
import {createApi, type Api} from './client';

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({baseUrl, children}: {baseUrl: string; children: ReactNode}) {
  const {auth} = useAuth();
  const api = useMemo(
    () => createApi({baseUrl, getToken: () => auth.getToken(), onUnauthorized: () => auth.refresh()}),
    [auth, baseUrl],
  );
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi outside ApiProvider');
  return api;
}
