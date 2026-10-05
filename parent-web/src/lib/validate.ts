/** Checks on what grown-ups type, matching the contract's patterns (backend/openapi.yaml). Pure functions. */

/** Why two PIN entries can't be saved yet (a translation key), or null when they can. */
export function pinProblem(pin: string, again: string): 'pinFormat' | 'pinMismatch' | null {
  if (!/^[0-9]{4}$/.test(pin)) return 'pinFormat';
  return pin === again ? null : 'pinMismatch';
}

/** Pairing codes on the TV: 6 characters, A–Z without I and O, 2–9. */
const PAIR_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** What a grown-up typed or a link carried, cleaned up: "k7qx-4m" → "K7QX4M". */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isPairCode = (code: string) => PAIR_CODE.test(code);
