/** What an approval gave (Claim.reward and minutesCredited in backend/openapi.yaml), said plainly. Pure functions. */
import type {Claim, Lang} from '../api/types';
import {translate} from '../i18n/strings';
import {MIN_PER_MARBLE} from '../tokens';
import {formatMinutes} from './format';

/**
 * "Mia +2 marbles"; "Jar was full: Mia earned a new character"; "Mia: routine job, praised". Minutes that
 * aren't whole marbles (a jar filled up by part of a marble) are said in minutes, and so is everything from a
 * server that doesn't say what it gave.
 */
export function rewardText(lang: Lang, claim: Claim, kid: string): string {
  switch (claim.reward) {
    case 'character':
      return translate(lang, 'rewardCharacter', {kid});
    case 'praise':
      return translate(lang, 'rewardPraise', {kid});
    case 'marbles': {
      const minutes = claim.minutesCredited ?? claim.minutes;
      const marbles = minutes / MIN_PER_MARBLE;
      if (Number.isInteger(marbles) && marbles > 0) {
        return marbles === 1 ? translate(lang, 'rewardMarble', {kid}) : translate(lang, 'rewardMarbles', {kid, n: marbles});
      }
      return `${kid} ${formatMinutes(lang, minutes, true)}`;
    }
    default:
      return `${kid} ${formatMinutes(lang, claim.minutes, true)}`;
  }
}
