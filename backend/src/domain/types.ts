/**
 * What the backend stores. The API shapes are in views.ts; the contract is backend/openapi.yaml.
 * Times are epoch milliseconds. Minutes are whole marbles: one marble = 10 minutes = 600 s (docs/08 §1.6).
 */
import type {JobIconName} from '../icons';
import type {VoiceStyle} from './voice-style';

export const LANGS = ['en', 'et', 'de', 'es'] as const;
export const COLORS = ['peach', 'mint', 'sky', 'lilac', 'gold'] as const;
export const AVATARS = ['bear', 'bunny'] as const;
export const PLATFORMS = ['fireos', 'vega', 'web'] as const;
export const DEVICE_MODES = ['amazon_kids', 'strict', 'api_mock'] as const;
export const CLAIM_STATUSES = ['waiting', 'approved', 'rejected'] as const;

export type Lang = (typeof LANGS)[number];
/** Each language's English name, as prompts say it. */
export const LANGUAGE_NAMES: Record<Lang, string> = {en: 'English', et: 'Estonian', de: 'German', es: 'Spanish'};
export type Color = (typeof COLORS)[number];
export type Avatar = (typeof AVATARS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type DeviceMode = (typeof DEVICE_MODES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
/**
 * HANDOFF: minutes settled by the Amazon Kids hand-off, which leave the jar. GAME stays for the history of the brain
 * games this API used to have.
 */
export type EntryType = 'ALLOWANCE' | 'CHORE' | 'GAME' | 'BONUS' | 'PENALTY' | 'USAGE' | 'ADJUST' | 'HANDOFF';
export type HandoffStatus = 'PENDING' | 'DONE' | 'SKIPPED';

/** One marble: one short TV session (docs/08 §1.6). */
export const MARBLE_SEC = 600;

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
  /** IANA zone; "today" (daily jobs) is this zone's day. */
  timezone: string;
  caps: boolean;
  voice: boolean;
  pin: PinHash | null;
  createdAt: number;
}

/** A kid's bedtime, in the family's local time: "19:30" to "07:00" (past midnight when `to` is earlier). */
export type Bedtime = {from: string; to: string};

export interface Child {
  id: string;
  name: string;
  avatar: Avatar;
  color: Color;
  age: number;
  createdAt: number;
  /** Earned time not yet used; never below 0 (taking minutes away stops at an empty jar). */
  balanceSec: number;
  /**
   * The daily budget (budget.ts). Stored as last written; older kids may lack the maximum (then the default for the
   * age) or have a base in steps of 5 (then the nearest marble): budgetOf() reads them by today's rules.
   */
  dailyMaxMin?: number;
  dailyBaseMin?: number;
  /** New characters earned (jobs approved while the jar was full) and not yet made. Missing on older kids (= 0). */
  characterTokens?: number;
  /** Penalty time not yet netted against an Amazon Kids hand-off (ledger.ts). */
  debtSec: number;
  /**
   * Minutes marked handed off (DONE or SKIPPED) on `handoffDueDay` (the family's local date): they stay in the jar for
   * the rest of that day and leave it at the next local midnight, when a HANDOFF entry settles them (ledger.ts).
   */
  handoffDueSec?: number;
  handoffDueDay?: string;
  /**
   * TV watched on `usedDay` (the family's local date), as the TVs counted it: how much of that day's base, and how
   * much earned time (which left balanceSec). On any other day both read as 0 (ledger.ts currentChild).
   */
  usedDay?: string;
  usedBaseSec?: number;
  usedEarnedSec?: number;
  /**
   * Puzzles (puzzles.ts): stars toward the next character, the family-local day of the last session that earned one
   * (read on another day it is cleared: ledger.ts currentChild), and the kid's level per subject.
   */
  puzzlesOff?: boolean;
  puzzleStars?: number;
  puzzleDay?: string;
  puzzleLevels?: Record<string, number>;
  /** The level a grown-up chose for every subject (1–4); absent or 0: the levels follow the kid's answers. */
  puzzleLevel?: number;
  /** When TV time ends for the night (openapi Bedtime); null or absent: none. */
  bedtime?: Bedtime | null;
  /** Right answers in a row per subject, and the puzzles already seen (newest last): puzzles/pick.ts. */
  puzzleStreaks?: Record<string, number>;
  puzzleSeen?: string[];
}

export type Repeat = {kind: 'daily'} | {kind: 'weekdays'; days: number[]} | {kind: 'once'};

export interface Chore {
  id: string;
  title: string;
  icon: JobIconName;
  color: Color;
  /** As stored; older jobs may hold 5–120 in steps of 5, read by jobMinutes() (budget.ts). */
  minutes: number;
  /** Stored by versions before Oct 13 2026, when a routine job was praised without a marble. Ignored: every job gives its minutes. A later "no TV time" switch gets a new field. */
  routine?: boolean;
  repeat: Repeat;
  childIds: string[];
  createdAt: number;
  /** Bumped on every write; writes that read the chore first check it (optimistic locking). */
  updatedAt: number;
}

export type RewardKind = 'marbles' | 'character' | 'praise';
/** Why a grown-up said "not yet", so the kid knows what to do next. */
export const NOT_YET_REASONS = ['not_finished', 'together', 'later'] as const;
export type NotYetReason = (typeof NOT_YET_REASONS)[number];

export interface Claim {
  /** The TV's client UUID: a resend finds the same claim. */
  id: string;
  childId: string;
  choreId: string;
  /** Copied at claim time, so history and approvals survive edits. */
  choreTitle: string;
  minutes: number;
  /** On claims made before Oct 13 2026: the job was routine at claim time. Not written any more, not read. */
  routine?: boolean;
  status: ClaimStatus;
  createdAt: number;
  decidedAt?: number;
  decidedBy?: 'parent' | 'tv';
  /** Approved by a parent who has set a name ("– Dad"). */
  approverName?: string;
  /** What the job card showed at claim time, and so what a yes gives (missing on claims made before promises). */
  promised?: {reward: RewardKind; minutes: number};
  /** Set on approval (budget.ts rewardFor). */
  reward?: RewardKind;
  minutesCredited?: number;
  /** Set on a "not yet" that came with a reason. */
  notYetReason?: NotYetReason;
  /** The "at most once per day" slot the claim holds: the family's local day, or "once" for a one-off job. */
  slot: string;
}

/**
 * A pass to answer one claim straight from its notification ("Yes" / "Not yet" on the lock screen): the claim, and
 * the parent whose browser was sent it. Kept under the hash of its token, used once, gone after a day.
 */
export interface PushPass {
  familyId: string;
  claimId: string;
  sub: string;
  expiresAt: number;
}

export interface LedgerEntry {
  id: string;
  childId: string;
  deltaSec: number;
  type: EntryType;
  reason: string;
  /** Claim id (or, in old history, a game result id). */
  refId?: string;
  /** "parent:<sub>", "tv:<deviceId>" or "system". */
  createdBy: string;
  createdAt: number;
  /** Amazon Kids hand-off, positive entries only. */
  handoff?: HandoffStatus;
  /** USAGE only: watched seconds that came out of the day's base (deltaSec is the earned part). */
  baseSec?: number;
}

/**
 * What a request with a client UUID produced, so a repeat gets the same answer and changes nothing.
 * "game" refs are old brain-game results, still in storage for up to 30 days.
 */
export type Ref = {kind: 'adjust'; entry: LedgerEntry} | {kind: 'game'; marbles: number} | {kind: 'usage'} | {kind: 'puzzle'};

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

// ---------- Characters (docs/08, Decisions 4–6) ----------

/**
 * Gemini-TTS voices (Google Cloud Text-to-Speech), which speak en, et, de and es; the art director picks one to suit
 * the character. Puck upbeat, Zephyr bright, Fenrir excitable, Leda youthful, Aoede breezy, Laomedeia upbeat, Achird
 * friendly, Sadachbia lively, Autonoe bright, Algenib gravelly, Achernar soft, Vindemiatrix gentle.
 */
export const VOICES = ['Puck', 'Zephyr', 'Fenrir', 'Leda', 'Aoede', 'Laomedeia', 'Achird', 'Sadachbia', 'Autonoe', 'Algenib', 'Achernar', 'Vindemiatrix'] as const;
export type Voice = (typeof VOICES)[number];

/** The Amazon Polly voices characters had before (Oct 7), as the Gemini voices they read as. */
const OLD_VOICES: Record<string, Voice> = {Ivy: 'Leda', Justin: 'Puck', Kevin: 'Fenrir'};

/** A stored voice as it reads today: a Gemini voice, or an old Polly one mapped to its Gemini voice. */
export const voiceOf = (stored: string): Voice => (VOICES.includes(stored as Voice) ? (stored as Voice) : (OLD_VOICES[stored] ?? 'Puck'));

/** The named, pivoted groups every drawing has; the TV moves each around its pivot. */
export const PARTS = ['body', 'head', 'eye-left', 'eye-right', 'mouth', 'arm-left', 'arm-right', 'legs', 'extra'] as const;
export type Part = (typeof PARTS)[number];

export const MOODS = ['happy', 'silly', 'brave', 'sleepy', 'proud', 'curious', 'calm'] as const;
export type Mood = (typeof MOODS)[number];

/** The art director's reading of the kid's words; this, never the raw words, is what gets drawn. */
export interface CharacterCard {
  what: string;
  colours: string[];
  outfit: string;
  mood: Mood;
  detail: string;
}

export type CharacterStatus = 'drawing' | 'ready' | 'needs_help';

export interface Character {
  id: string;
  childId: string;
  status: CharacterStatus;
  /** The kid's words. */
  description: string;
  name: string;
  /** Characters made before the Gemini voices hold a Polly name (Ivy, Justin, Kevin): read it with voiceOf. */
  voice: Voice | string;
  /** How it sounds (voice-style.ts); missing on characters made before voice styles (then the mood's default). */
  voiceStyle?: VoiceStyle;
  card: CharacterCard;
  createdAt: number;
  readyAt?: number;
}

/** One layer of a ready character, in drawing order: a complete small SVG; a named part moves around its pivot. */
export interface Layer {
  part?: Part;
  /** The named part this layer's part was drawn inside and rides on (the TV moves it with that part first). */
  parent?: Part;
  pivot?: [number, number];
  svg: string;
}

/** A ready character's pictures, stored apart from the character so lists stay small. Never changes. */
export interface CharacterArt {
  id: string;
  childId: string;
  viewBox: string;
  /** The whole checked SVG, for the parent app. */
  svg: string;
  layers: Layer[];
}

// ---------- Live updates and notifications ----------

/** An open realtime (WebSocket) connection of a TV or a parent, tied to a family. */
export interface Connection {
  id: string;
  familyId: string;
  kind: 'tv' | 'parent';
  connectedAt: number;
  /** API Gateway closes a connection after 2 hours at most; the stored one goes an hour later. */
  expiresAt: number;
}

/** A parent's browser that wants a notification when a kid says "I did it!" (Web Push). */
export interface PushSubscription {
  endpoint: string;
  keys: {p256dh: string; auth: string};
  /** The parent who subscribed (Cognito sub). */
  sub: string;
  createdAt: number;
}
