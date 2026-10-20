/**
 * Puzzles on the TV (docs/08 §3, and "Decisions (Oct 12)"): the backend keeps what a kid earned, their levels and
 * how their rounds went. They never earn TV time: every finished round earns one star, whatever the score (a fixed
 * reward for taking part is the form that harms interest least, docs/08 §3.1), and PUZZLE_STARS stars earn a new
 * character.
 */
import {LEVELS} from '../puzzles/items';
import type {Child} from './types';

/** Stars for a character: five finished rounds (an assumption to test, docs/08). */
export const PUZZLE_STARS = 5;

/** A kid's puzzles as read today (`puzzleDay` is set only when a round was finished today: ledger.ts currentChild). */
export const puzzlesOf = (child: Pick<Child, 'puzzlesOff' | 'puzzleStars' | 'puzzleDay' | 'puzzleLevels' | 'puzzleLevel'>) => ({
  on: !child.puzzlesOff, stars: child.puzzleStars ?? 0, starsNeeded: PUZZLE_STARS, doneToday: child.puzzleDay !== undefined, levels: {...child.puzzleLevels},
  level: child.puzzleLevel ?? 0, levelAges: LEVELS.map(level => level.ages),
});
