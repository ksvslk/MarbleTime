/**
 * Request checks, one per schema in openapi.yaml. Each returns the cleaned-up input (user text trimmed)
 * or throws a 400 that names the field: `{"error": {"code": "invalid", "message": "name must be 1–24 characters"}}`.
 * Unknown fields are ignored, as the schemas allow.
 */
import {JOB_ICON_NAMES} from '../icons';
import {ApiError} from './errors';
import {PAIRING_CODE} from './secrets';
import {isTimezone} from './time';
import {AVATARS, CLAIM_STATUSES, COLORS, DEVICE_MODES, type Lang, LANGS, PLATFORMS, type Repeat} from './types';

export type Check<T> = (value: unknown, path: string) => T;

const fail = (path: string, problem: string) => new ApiError(400, 'invalid', `${path} ${problem}`);

/** User text: trimmed, length counted in characters (not UTF-16 units, so "Õnnela" and emoji count right). */
export const text = (min: number, max: number): Check<string> => (value, path) => {
  if (typeof value !== 'string') throw fail(path, 'must be a string');
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < min || length > max) throw fail(path, min > 0 ? `must be ${min}–${max} characters` : `must be at most ${max} characters`);
  return trimmed;
};

export const matches = (pattern: RegExp, what: string): Check<string> => (value, path) => {
  if (typeof value !== 'string' || !pattern.test(value)) throw fail(path, `must be ${what}`);
  return value;
};

export const integer = (min: number, max: number, step = 1): Check<number> => (value, path) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max || value % step !== 0) {
    throw fail(path, `must be a whole number from ${min} to ${max}${step > 1 ? ` in steps of ${step}` : ''}`);
  }
  return value;
};

export const boolean: Check<boolean> = (value, path) => {
  if (typeof value !== 'boolean') throw fail(path, 'must be true or false');
  return value;
};

export const oneOf = <T extends string>(values: readonly T[]): Check<T> => (value, path) => {
  if (!values.includes(value as T)) throw fail(path, `must be one of: ${values.join(', ')}`);
  return value as T;
};

export const list = <T>(item: Check<T>, min: number, max: number, unique = false): Check<T[]> => (value, path) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw fail(path, `must be a list of ${min}–${max} items`);
  const items = value.map((each, i) => item(each, `${path}[${i}]`));
  if (unique && new Set(items).size !== items.length) throw fail(path, 'must not repeat an item');
  return items;
};

type Shape = Record<string, Check<unknown>>;
type Parsed<S extends Shape, R extends keyof S> = {[K in R]: ReturnType<S[K]>} & {[K in Exclude<keyof S, R>]?: ReturnType<S[K]>};

/** An object with the given fields; `required` ones must be present. Fields not in the shape are dropped. */
export function object<S extends Shape, R extends keyof S = never>(shape: S, required: readonly R[] = []): Check<Parsed<S, R>> {
  return (value, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw fail(path, 'must be a JSON object');
    const out: Record<string, unknown> = {};
    for (const [key, check] of Object.entries(shape)) {
      const field = (value as Record<string, unknown>)[key];
      const at = path === 'body' ? key : `${path}.${key}`;
      if (field !== undefined) out[key] = check(field, at);
      else if ((required as readonly string[]).includes(key)) throw fail(at, 'is required');
    }
    return out as Parsed<S, R>;
  };
}

/** Ids are server UUIDs or the apps' client UUIDs; they go into storage keys, so only a safe alphabet. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const id = matches(ID, 'an id (letters, digits, - and _)');
const pin = matches(/^[0-9]{4}$/, '4 digits');
const timezone: Check<string> = (value, path) => {
  if (typeof value !== 'string' || !isTimezone(value)) throw fail(path, 'must be an IANA time zone, e.g. Europe/Tallinn');
  return value;
};
/** Job minutes: 1–3 marbles (docs/08 §2). */
const minutes = integer(10, 30, 10);
/** The daily budget (budget.ts clamps them to the kid's age and to each other). */
const dailyBase = integer(0, 120, 10);
const dailyMax = integer(10, 120, 10);
const time = integer(0, Number.MAX_SAFE_INTEGER);

const repeat: Check<Repeat> = (value, path) => {
  const {kind} = object({kind: oneOf(['daily', 'weekdays', 'once'] as const)}, ['kind'])(value, path);
  if (kind !== 'weekdays') return {kind};
  const {days} = object({days: list(integer(1, 7), 1, 7, true)}, ['days'])(value, path);
  return {kind, days: days.sort((a, b) => a - b)};
};

export const familyCreate = object({name: text(1, 40), lang: oneOf(LANGS), timezone, pin}, ['name', 'lang', 'timezone', 'pin']);
export const familyPatch = object({name: text(1, 40), lang: oneOf(LANGS), timezone, caps: boolean, voice: boolean, pin});

export const meInput = object({name: text(1, 24)}, ['name']);

const child = {name: text(1, 24), avatar: oneOf(AVATARS), color: oneOf(COLORS), age: integer(3, 12), dailyBaseMin: dailyBase, dailyMaxMin: dailyMax};
export const childInput = object(child, ['name', 'avatar', 'color', 'age']);
export const childPatch = object(child);

const chore = {title: text(1, 60), icon: oneOf(JOB_ICON_NAMES), color: oneOf(COLORS), minutes, routine: boolean, repeat, childIds: list(id, 1, 100)};
export const choreInput = object(chore, ['title', 'minutes', 'childIds']);
export const chorePatch = object(chore);

/** Bonus or minus in whole marbles. */
const deltaMin: Check<number> = (value, path) => {
  const delta = integer(-120, 120, 10)(value, path);
  if (delta === 0) throw fail(path, 'must not be 0');
  return delta;
};
export const adjustInput = object({id, deltaMin, reason: text(0, 80)}, ['deltaMin', 'reason']);
export const handoffInput = object({entryIds: list(id, 1, 200), status: oneOf(['DONE', 'SKIPPED'] as const)}, ['entryIds', 'status']);
export const claimStatus = oneOf(CLAIM_STATUSES);

export const pairingInput = object({platform: oneOf(PLATFORMS)}, ['platform']);
export const confirmInput = object({name: text(1, 40), mode: oneOf(DEVICE_MODES)}, ['name']);
export const devicePatch = object({name: text(1, 40), mode: oneOf(DEVICE_MODES)});

export const claimInput = object({id, childId: id, choreId: id, at: time}, ['id', 'childId', 'choreId', 'at']);
export const decideInput = object({yes: boolean, pin}, ['yes', 'pin']);

/** A grown-up changes the TV settings on the TV: the PIN and at least one setting. */
export const tvSettingsInput: Check<{pin: string; lang?: Lang; caps?: boolean; voice?: boolean}> = (value, path) => {
  const input = object({pin, lang: oneOf(LANGS), caps: boolean, voice: boolean}, ['pin'])(value, path);
  if (input.lang === undefined && input.caps === undefined && input.voice === undefined) {
    throw fail(path, 'must change at least one of lang, caps, voice');
  }
  return input;
};
/** The kid's idea for a character, typed or from /speech-to-text. */
export const characterInput = object({description: text(1, 200)}, ['description']);
/** A short line a character says on the TV, in the family's language; the character's voice, mood and style shape it. */
/** A line for the TV: said by a character, or by the narrator (no characterId). */
export const speechInput = object({text: text(1, 160), lang: oneOf(LANGS), characterId: text(1, 64)}, ['text', 'lang']);
export const heartbeatInput = object({appVersion: text(0, 40)});

/** A browser's push service address: https only (that's where pushes go), at most 1000 characters. */
const pushEndpoint: Check<string> = (value, path) => {
  const url = typeof value === 'string' && value.length <= 1000 && URL.canParse(value) ? new URL(value) : undefined;
  if (url?.protocol !== 'https:') throw fail(path, 'must be an https URL of at most 1000 characters');
  return value as string;
};
const pushKey = matches(/^[A-Za-z0-9_-]{1,200}={0,2}$/, 'base64url');
export const pushSubscriptionInput = object(
  {endpoint: pushEndpoint, keys: object({p256dh: pushKey, auth: pushKey}, ['p256dh', 'auth'])},
  ['endpoint', 'keys'],
);
export const pushEndpointInput = object({endpoint: pushEndpoint}, ['endpoint']);

/** A pairing code from a URL; parents may type it in lower case. */
export const pairingCode = (value: string) => matches(PAIRING_CODE, '6 characters from A–Z (no I, O) and 2–9')(value.toUpperCase(), 'code');

/** An id from a URL (characters): unknown ones are simply not found. */
export const isId = (value: string) => ID.test(value);

/** `?limit=` for the ledger: 1–200, default 50. */
export function ledgerLimit(value: string | undefined): number {
  if (value === undefined) return 50;
  return integer(1, 200)(/^\d+$/.test(value) ? Number(value) : NaN, 'limit');
}

export type FamilyCreate = ReturnType<typeof familyCreate>;
export type FamilyPatch = ReturnType<typeof familyPatch>;
export type ChildInput = ReturnType<typeof childInput>;
export type ChildPatch = ReturnType<typeof childPatch>;
export type ChoreInput = ReturnType<typeof choreInput>;
export type ChorePatch = ReturnType<typeof chorePatch>;
export type AdjustInput = ReturnType<typeof adjustInput>;
export type HandoffInput = ReturnType<typeof handoffInput>;
export type ConfirmInput = ReturnType<typeof confirmInput>;
export type DevicePatch = ReturnType<typeof devicePatch>;
export type ClaimInput = ReturnType<typeof claimInput>;
export type DecideInput = ReturnType<typeof decideInput>;
export type TvSettingsInput = ReturnType<typeof tvSettingsInput>;
export type MeInput = ReturnType<typeof meInput>;
export type CharacterInput = ReturnType<typeof characterInput>;
export type SpeechInput = ReturnType<typeof speechInput>;
