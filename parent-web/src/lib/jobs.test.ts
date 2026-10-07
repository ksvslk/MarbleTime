import {describe, expect, it} from 'vitest';
import type {Child, Chore} from '../api/types';
import {draftFrom, JOB_MARBLES, JOB_MINUTES, jobMinutes, newJobDraft, toInput} from './jobs';

const kid = (id: string): Child => ({
  id,
  name: id,
  avatar: 'bear',
  color: 'peach',
  age: 6,
  balanceSec: 0,
  dailyBaseMin: 30,
  dailyMaxMin: 60,
  characterTokens: 0,
});

const chore = (overrides: Partial<Chore> = {}): Chore => ({
  id: 'j1',
  title: 'Feed Rex',
  icon: 'dog',
  color: 'mint',
  minutes: 20,
  routine: false,
  repeat: {kind: 'daily'},
  childIds: ['k1'],
  createdAt: 0,
  ...overrides,
});

describe('what a job is worth', () => {
  it('is 1–3 marbles: 10–30 minutes', () => {
    expect(JOB_MARBLES).toEqual([1, 2, 3]);
    expect(JOB_MINUTES).toEqual({min: 10, max: 30});
  });

  it('fits jobs saved when a marble was 5 minutes into 1–3 marbles', () => {
    expect(jobMinutes(5)).toBe(10);
    expect(jobMinutes(15)).toBe(20);
    expect(jobMinutes(20)).toBe(20);
    expect(jobMinutes(45)).toBe(30);
    expect(jobMinutes(120)).toBe(30);
  });
});

describe('the job form', () => {
  it('starts a new job at one marble, not routine, every day, for every kid, colours in turn', () => {
    const draft = newJobDraft([kid('k1'), kid('k2')], 5);
    expect(draft).toMatchObject({title: '', minutes: 10, routine: false, childIds: ['k1', 'k2'], repeat: 'daily', color: 'mint'});
    expect(draft.icon).toBeUndefined();
  });

  it('opens a saved job as it is, with routine off when the server leaves it out', () => {
    expect(draftFrom(chore({routine: true}))).toMatchObject({minutes: 20, routine: true, icon: 'dog'});
    const {routine: _, ...withoutRoutine} = chore();
    expect(draftFrom(withoutRoutine as Chore).routine).toBe(false);
    expect(draftFrom(chore({minutes: 45})).minutes).toBe(30);
    expect(draftFrom(chore({repeat: {kind: 'weekdays', days: [6, 7]}})).days).toEqual([6, 7]);
  });

  it('sends the marbles and the routine switch, for new jobs and edits alike', () => {
    expect(toInput({...draftFrom(chore()), title: '  Feed Rex  '})).toEqual({
      title: 'Feed Rex',
      minutes: 20,
      routine: false,
      childIds: ['k1'],
      repeat: {kind: 'daily'},
      color: 'mint',
      icon: 'dog',
    });
    expect(toInput({...draftFrom(chore()), routine: true, minutes: 30})).toMatchObject({minutes: 30, routine: true});
  });

  it('keeps a routine job’s marbles, for when it stops being routine', () => {
    const routine = toInput({...draftFrom(chore({minutes: 30})), routine: true});
    expect(routine.minutes).toBe(30);
  });

  it('sends days in order for "some days", and no icon for a new job (the server picks one)', () => {
    const draft = {...newJobDraft([kid('k1')], 0), title: 'Bins', repeat: 'weekdays' as const, days: [5, 1, 3]};
    const input = toInput(draft);
    expect(input.repeat).toEqual({kind: 'weekdays', days: [1, 3, 5]});
    expect('icon' in input).toBe(false);
  });
});
