import {createHash, randomBytes, randomInt, randomUUID, timingSafeEqual} from 'node:crypto';
import type {PinHash} from './types';

export const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex');

export const newId = () => randomUUID();

/** 256 random bits; the server keeps only sha256(token) (docs/03 §9). */
export const newDeviceToken = () => randomBytes(32).toString('base64url');

/** No look-alikes (no I, O, 0, 1), so a code read off the TV is easy to type. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export const newPairingCode = () => Array.from({length: 6}, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): PinHash {
  return {salt, hash: sha256Hex(`${salt}:${pin}`)};
}

export function pinMatches(pin: string, stored: PinHash): boolean {
  const given = Buffer.from(sha256Hex(`${stored.salt}:${pin}`), 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
