import {DAILY_GAME_MARBLES, KidId} from './data';
import {MIN_PER_MARBLE} from './tokens';

export type Screen =
  | {name: 'who'}
  | {name: 'board'; kidId: KidId; focusId?: string}
  | {name: 'claimed'; kidId: KidId; jobId: string}
  | {name: 'yay'; kidId: KidId; marbles: number; reason: string}
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

export interface Celebration {
  kidId: KidId;
  marbles: number;
  reason: string;
}

export interface State {
  screen: Screen;
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
  | {type: 'decide'; claimId: string; yes: boolean; minutes: number; jobTitle: string}
  | {type: 'gameDone'; kidId: KidId; marbles: number; title: string}
  | {type: 'celebrated'; kidId: KidId};

export const initialState: State = {
  screen: {name: 'who'},
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
        balances: {...state.balances, [claim.kidId]: state.balances[claim.kidId] + action.minutes},
        celebrations: [...state.celebrations, {kidId: claim.kidId, marbles: action.minutes / MIN_PER_MARBLE, reason: `A grown-up said yes to ${action.jobTitle}!`}],
      };
    }
    case 'gameDone': {
      const left = Math.max(0, DAILY_GAME_MARBLES - state.gameMarblesToday[action.kidId]);
      const marbles = Math.min(left, action.marbles);
      return {
        ...state,
        balances: {...state.balances, [action.kidId]: state.balances[action.kidId] + marbles * MIN_PER_MARBLE},
        gameMarblesToday: {...state.gameMarblesToday, [action.kidId]: state.gameMarblesToday[action.kidId] + marbles},
        screen: {name: 'yay', kidId: action.kidId, marbles, reason: marbles > 0 ? `You finished ${action.title}!` : 'No more game marbles today. Try a job!'},
      };
    }
    case 'celebrated':
      return {...state, celebrations: state.celebrations.filter(c => c.kidId !== action.kidId)};
  }
}

export const marblesIn = (minutes: number) => Math.floor(minutes / MIN_PER_MARBLE);
