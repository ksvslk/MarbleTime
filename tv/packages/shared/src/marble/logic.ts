import {DAILY_GAME_MARBLES, Family, KidId, SAMPLE_FAMILY} from './data';
import {Lang} from './i18n';
import {MIN_PER_MARBLE} from './tokens';

export type Screen =
  | {name: 'who'}
  | {name: 'board'; kidId: KidId; focusId?: string}
  | {name: 'claimed'; kidId: KidId; jobId: string}
  | {name: 'yay'; kidId: KidId; marbles: number; why: Why}
  | {name: 'game'; kidId: KidId; gameId: string}
  | {name: 'pin'}
  | {name: 'grownups'};

export interface Claim {
  id: string;
  kidId: KidId;
  jobId: string;
  status: 'waiting' | 'approved' | 'rejected';
  at: number;
}

/** Why marbles arrived; the screen turns it into words in the family language. */
export type Why = {kind: 'job'; jobId: string} | {kind: 'game'; gameId: string} | {kind: 'cap'};

export interface Celebration {
  kidId: KidId;
  marbles: number;
  jobId: string;
}

export interface State {
  screen: Screen;
  /** The family language (a grown-ups setting). */
  lang: Lang;
  /** Kids, jobs and games (from the parent app in M2). */
  family: Family;
  /** Show kid-facing text in CAPITAL LETTERS (a grown-ups setting; many young kids learn capitals first). */
  caps: boolean;
  /** Minutes in each kid's jar. */
  balances: Record<KidId, number>;
  claims: Claim[];
  gameMarblesToday: Record<KidId, number>;
  /** Approvals made while the kid was away; shown as "Yay!" when the kid opens the board. */
  celebrations: Celebration[];
}

export type Action =
  | {type: 'go'; screen: Screen}
  | {type: 'claim'; kidId: KidId; jobId: string}
  | {type: 'undoClaim'; kidId: KidId; jobId: string}
  | {type: 'decide'; claimId: string; yes: boolean; minutes: number}
  | {type: 'gameDone'; kidId: KidId; marbles: number; gameId: string}
  | {type: 'setLang'; lang: Lang}
  | {type: 'setCaps'; caps: boolean}
  | {type: 'setFamily'; family: Family; balances?: Record<KidId, number>}
  | {type: 'celebrated'; kidId: KidId};

export const initialState: State = {
  screen: {name: 'who'},
  lang: 'en',
  family: SAMPLE_FAMILY,
  caps: false,
  balances: {mia: 35, leo: 20},
  claims: [],
  gameMarblesToday: {mia: 0, leo: 0},
  celebrations: [],
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'go':
      return {...state, screen: action.screen};
    case 'claim': {
      if (state.claims.some(c => c.kidId === action.kidId && c.jobId === action.jobId && c.status === 'waiting')) {
        return {...state, screen: {name: 'claimed', kidId: action.kidId, jobId: action.jobId}};
      }
      const claim: Claim = {id: `${action.kidId}-${action.jobId}-${Date.now()}`, kidId: action.kidId, jobId: action.jobId, status: 'waiting', at: Date.now()};
      return {...state, claims: [...state.claims, claim], screen: {name: 'claimed', kidId: action.kidId, jobId: action.jobId}};
    }
    case 'undoClaim':
      return {
        ...state,
        claims: state.claims.filter(c => !(c.kidId === action.kidId && c.jobId === action.jobId && c.status === 'waiting')),
        screen: {name: 'board', kidId: action.kidId, focusId: action.jobId},
      };
    case 'decide': {
      const claim = state.claims.find(c => c.id === action.claimId);
      if (!claim || claim.status !== 'waiting') return state;
      const claims = state.claims.map(c => (c.id === claim.id ? {...c, status: action.yes ? 'approved' : 'rejected'} as Claim : c));
      if (!action.yes) return {...state, claims};
      return {
        ...state,
        claims,
        balances: {...state.balances, [claim.kidId]: balanceOf(state, claim.kidId) + action.minutes},
        celebrations: [...state.celebrations, {kidId: claim.kidId, marbles: action.minutes / MIN_PER_MARBLE, jobId: claim.jobId}],
      };
    }
    case 'gameDone': {
      const left = Math.max(0, DAILY_GAME_MARBLES - (state.gameMarblesToday[action.kidId] ?? 0));
      const marbles = Math.min(left, action.marbles);
      return {
        ...state,
        balances: {...state.balances, [action.kidId]: balanceOf(state, action.kidId) + marbles * MIN_PER_MARBLE},
        gameMarblesToday: {...state.gameMarblesToday, [action.kidId]: (state.gameMarblesToday[action.kidId] ?? 0) + marbles},
        screen: {name: 'yay', kidId: action.kidId, marbles, why: marbles > 0 ? {kind: 'game', gameId: action.gameId} : {kind: 'cap'}},
      };
    }
    case 'setLang':
      return {...state, lang: action.lang};
    case 'setCaps':
      return {...state, caps: action.caps};
    case 'setFamily':
      return {...state, family: action.family, balances: action.balances ?? {}, claims: [], celebrations: [], gameMarblesToday: {}, screen: {name: 'who'}};
    case 'celebrated':
      return {...state, celebrations: state.celebrations.filter(c => c.kidId !== action.kidId)};
  }
}

export const marblesIn = (minutes: number) => Math.floor(minutes / MIN_PER_MARBLE);
export const balanceOf = (state: State, kidId: KidId) => state.balances[kidId] ?? 0;
