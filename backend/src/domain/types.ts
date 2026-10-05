/**
 * What the backend stores. The API shapes are in views.ts; the contract is backend/openapi.yaml.
 * Times are epoch milliseconds. Job minutes are multiples of 5: one marble = 5 minutes = 300 s.
 */
import type {JobIconName} from '../icons';

export const LANGS = ['en', 'et', 'de', 'es'] as const;
export const COLORS = ['peach', 'mint', 'sky', 'lilac', 'gold'] as const;
export const AVATARS = ['bear', 'bunny'] as const;
export const TOPICS = ['numbers', 'words', 'puzzles'] as const;
export const PLATFORMS = ['fireos', 'vega', 'web'] as const;
export const DEVICE_MODES = ['amazon_kids', 'strict', 'api_mock'] as const;
export const CLAIM_STATUSES = ['waiting', 'approved', 'rejected'] as const;

export type Lang = (typeof LANGS)[number];
export type Color = (typeof COLORS)[number];
export type Avatar = (typeof AVATARS)[number];
export type Topic = (typeof TOPICS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type DeviceMode = (typeof DEVICE_MODES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type EntryType = 'ALLOWANCE' | 'CHORE' | 'GAME' | 'BONUS' | 'PENALTY' | 'USAGE' | 'ADJUST';
export type HandoffStatus = 'PENDING' | 'DONE' | 'SKIPPED';

export const MARBLE_SEC = 300;

/** A signed-in parent: the Cognito `sub` (the dev server: "dev-<name>"). */
export interface Parent {
  sub: string;
  email?: string;
}

export interface PinHash {
  salt: string;
  /** hex(sha256(salt + ":" + pin)); the TV gets it so it can check the PIN offline. */
  hash: string;
}

export interface Family {
  id: string;
  name: string;
  lang: Lang;
  /** IANA zone; "today" (daily jobs, the game cap) is this zone's day. */
  timezone: string;
  caps: boolean;
  voice: boolean;
  pin: PinHash | null;
  createdAt: number;
}

export interface GameSettings {
  topics: Topic[];
  dailyCapMarbles: number;
}

export interface Child {
  id: string;
  name: string;
  avatar: Avatar;
  color: Color;
  age: number;
  games: GameSettings;
  createdAt: number;
  /** Earned time. Penalties can take it below zero. */
  balanceSec: number;
  /** Penalty time not yet netted against an Amazon Kids hand-off (ledger.ts). */
  debtSec: number;
  /** Game marbles earned on `gameDay` (the family's local date), for the daily cap. */
  gameDay?: string;
  gameMarbles?: number;
}

export type Repeat = {kind: 'daily'} | {kind: 'weekdays'; days: number[]} | {kind: 'once'};

export interface Chore {
  id: string;
  title: string;
  icon: JobIconName;
  color: Color;
  minutes: number;
  repeat: Repeat;
  childIds: string[];
  createdAt: number;
  /** Bumped on every write; writes that read the chore first check it (optimistic locking). */
  updatedAt: number;
}

export interface Claim {
  /** The TV's client UUID: a resend finds the same claim. */
  id: string;
  childId: string;
  choreId: string;
  /** Copied at claim time, so history and approvals survive edits. */
  choreTitle: string;
  minutes: number;
  status: ClaimStatus;
  createdAt: number;
  decidedAt?: number;
  decidedBy?: 'parent' | 'tv';
  /** The "at most once per day" slot the claim holds: the family's local day, or "once" for a one-off job. */
  slot: string;
}

export interface LedgerEntry {
  id: string;
  childId: string;
  deltaSec: number;
  type: EntryType;
  reason: string;
  /** Claim id or game result id. */
  refId?: string;
  /** "parent:<sub>", "tv:<deviceId>" or "system". */
  createdBy: string;
  createdAt: number;
  /** Amazon Kids hand-off, positive entries only. */
  handoff?: HandoffStatus;
}

/** What a request with a client UUID produced, so a repeat gets the same answer and changes nothing. */
export type Ref = {kind: 'adjust'; entry: LedgerEntry} | {kind: 'game'; marbles: number};

export interface Device {
  id: string;
  familyId: string;
  name: string;
  platform: Platform;
  mode: DeviceMode;
  createdAt: number;
  lastSeen?: number;
  appVersion?: string;
  /** sha256 of the device token; the token itself is never stored. */
  tokenHash?: string;
  /** Times of wrong grown-ups PINs entered on this TV in the last minute. */
  pinFails?: number[];
}

export type Pairing = {
  code: string;
  platform: Platform;
  createdAt: number;
  expiresAt: number;
} & (
  | {status: 'waiting'}
  | {
      status: 'paired';
      familyId: string;
      deviceId: string;
      /** The device token was handed out (it is made then, and only its hash is kept). */
      tokenIssued?: boolean;
    }
);
