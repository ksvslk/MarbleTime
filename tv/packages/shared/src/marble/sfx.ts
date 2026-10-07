/** Sound effects made by scripts/make-sounds.py (synthesized here, so no licence questions). */
export type SfxName = 'clink' | 'lidOpen' | 'lidClose' | 'yay' | 'tryAgain' | 'claim' | 'tap';

/** Each sound can have variants; one is picked at random so repeated clinks don't sound robotic. */
export const SFX: Record<SfxName, number[]> = {
  clink: [require('../assets/sfx/clink1.mp3'), require('../assets/sfx/clink2.mp3'), require('../assets/sfx/clink3.mp3')],
  lidOpen: [require('../assets/sfx/lid-open.mp3')],
  lidClose: [require('../assets/sfx/lid-close.mp3')],
  yay: [require('../assets/sfx/yay.mp3')],
  tryAgain: [require('../assets/sfx/try-again.mp3')],
  claim: [require('../assets/sfx/claim.mp3')],
  tap: [require('../assets/sfx/tap.mp3')],
};
