import type {Device} from '../api/types';

/** Amazon's Parent Dashboard, where a grown-up adds bonus time (until there is an API: docs/07). */
export const AMAZON_PARENT_DASHBOARD = 'https://parents.amazon.com';

/**
 * Whether to offer the Amazon Kids hand-off: when any TV is in Amazon Kids mode, or before any TV is paired
 * (Amazon Kids is the default mode, docs/03 §3). Strict and API-demo TVs get their minutes without it.
 */
export const usesAmazonKids = (devices: Device[]) => devices.length === 0 || devices.some(d => d.mode === 'amazon_kids');

/** The API marks at most 200 hand-off entries per request. */
export const HANDOFF_BATCH = 200;

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
