import React, {createContext, useContext, useMemo, useReducer} from 'react';
import {Action, initialState, reducer, State} from './logic';

export * from './logic';

const Ctx = createContext<{state: State; dispatch: React.Dispatch<Action>} | null>(null);

export function StoreProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({state, dispatch}), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStore outside StoreProvider');
  return value;
}

