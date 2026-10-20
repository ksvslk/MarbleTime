import {describe, expect, it} from 'vitest';
import type {Claim} from '../api/types';
import {rewardText} from './rewards';

const approved = (overrides: Partial<Claim>): Claim => ({
  id: 'c1',
  childId: 'k1',
  choreId: 'j1',
  choreTitle: 'Feed Rex',
  status: 'approved',
  minutes: 20,
  createdAt: 0,
  decidedAt: 1,
  decidedBy: 'parent',
  ...overrides,
});

describe('what an approval gave', () => {
  it('marbles: counts the marbles that went into the jar', () => {
    expect(rewardText('en', approved({reward: 'marbles', minutesCredited: 20}), 'Mia')).toBe('Mia +2 marbles');
    expect(rewardText('en', approved({reward: 'marbles', minutesCredited: 10}), 'Mia')).toBe('Mia +1 marble');
    expect(rewardText('de', approved({reward: 'marbles', minutesCredited: 30}), 'Mia')).toBe('Mia +3 Murmeln');
    expect(rewardText('et', approved({reward: 'marbles', minutesCredited: 10}), 'Mia')).toBe('Mia +1 kuul');
  });

  it('marbles: says only what fitted under the ceiling', () => {
    expect(rewardText('en', approved({minutes: 30, reward: 'marbles', minutesCredited: 10}), 'Mia')).toBe('Mia +1 marble');
    // Part of a marble (the jar had 5 minutes of room) is said in minutes.
    expect(rewardText('en', approved({minutes: 30, reward: 'marbles', minutesCredited: 5}), 'Mia')).toBe('Mia +5 min');
  });

  it('character with marbles: the job only partly fitted', () => {
    expect(rewardText('en', approved({reward: 'character', minutesCredited: 10}), 'Mia')).toBe('Mia +1 marble and a new character');
    expect(rewardText('et', approved({reward: 'character', minutesCredited: 20}), 'Mia')).toBe('Mia +2 kuuli ja uus tegelane');
  });

  it('character: the jar was full', () => {
    expect(rewardText('en', approved({reward: 'character', minutesCredited: 0}), 'Mia')).toBe('Jar was full: Mia earned a new character');
    expect(rewardText('es', approved({reward: 'character', minutesCredited: 0}), 'Mia')).toBe('El tarro estaba lleno: Mia ganó un personaje nuevo');
  });

  it('praise: a routine job', () => {
    expect(rewardText('en', approved({reward: 'praise', minutesCredited: 0}), 'Mia')).toBe('Mia: routine job, praised');
  });

  it('falls back to the job’s minutes when the server doesn’t say', () => {
    expect(rewardText('en', approved({}), 'Mia')).toBe('Mia +20 min');
    expect(rewardText('en', approved({reward: 'marbles'}), 'Mia')).toBe('Mia +2 marbles');
  });
});
