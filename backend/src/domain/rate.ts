/** Hourly limits on things that cost money per use (model calls, Polly, Transcribe): fixed windows per clock hour. */
import type {Deps} from './deps';
import {ApiError} from './errors';
import {HOUR} from './time';

/** Counts one use in this clock hour; 429 too_many with Retry-After once `limit` are used. */
export async function takeHourly(deps: Deps, familyId: string, key: string, limit: number, message: string): Promise<void> {
  const now = deps.now();
  const hour = now - (now % HOUR);
  if (!(await deps.repo.takeRate(familyId, key, hour, HOUR, limit))) {
    throw new ApiError(429, 'too_many', message, {'retry-after': String(Math.ceil((hour + HOUR - now) / 1000))});
  }
}
