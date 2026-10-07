/** The grown-ups PIN on a TV: one check, and one wrong-PIN limit per TV, for everything a grown-up does there. */
import type {Deps} from './deps';
import {ApiError} from './errors';
import {pinMatches} from './secrets';
import {MINUTE} from './time';
import type {Device, Family} from './types';

/** Wrong PINs allowed per TV per minute; the next try gets 429, even with the right PIN. */
const PIN_TRIES = 5;

/** Throws 429 too_many_tries, 403 no_pin or 403 wrong_pin (counted for this TV); returns when the PIN is right. */
export async function checkTvPin(deps: Deps, family: Family, device: Device, pin: string): Promise<void> {
  const now = deps.now();
  const fails = (device.pinFails ?? []).filter(time => now - time < MINUTE);
  if (fails.length >= PIN_TRIES) {
    const wait = Math.ceil((fails[0] + MINUTE - now) / 1000);
    throw new ApiError(429, 'too_many_tries', 'Too many wrong PINs on this TV; wait a minute', {'retry-after': String(wait)});
  }
  if (!family.pin) throw new ApiError(403, 'no_pin', 'Set a grown-ups PIN in the parent app first');
  if (!pinMatches(pin, family.pin)) {
    await deps.repo.updateDevice(family.id, device.id, {pinFails: [...fails, now]});
    throw new ApiError(403, 'wrong_pin', 'Wrong PIN');
  }
}
