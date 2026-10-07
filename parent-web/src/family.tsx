import {createContext, useContext} from 'react';
import type {FamilyBundle, Me} from './api/types';

/** The signed-in grown-up's family: everything GET /family returns, shared by every screen. */
export interface FamilyState {
  me: Me;
  bundle: FamilyBundle;
  /** Fetch it all again in the background (the TV may have changed balances); never throws. */
  refresh: () => Promise<void>;
  /** Apply a change the API just confirmed, without waiting for a refresh. */
  update: (change: (bundle: FamilyBundle) => FamilyBundle) => void;
  /** Who is signed in, as PATCH /me just returned it (the name kids see). */
  setMe: (me: Me) => void;
}

export const FamilyContext = createContext<FamilyState | null>(null);

export function useFamily(): FamilyState {
  const value = useContext(FamilyContext);
  if (!value) throw new Error('useFamily outside FamilyContext');
  return value;
}
