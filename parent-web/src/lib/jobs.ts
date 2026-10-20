/** A job as the form edits it, and as the contract takes it (Chore, ChoreInput). Pure functions. */
import type {Child, Chore, ChoreInput, Color, JobIcon, Repeat} from '../api/types';
import {MIN_PER_MARBLE} from '../tokens';
import {clampStep} from './time';

/** A job is worth 1–3 marbles (10–30 minutes): small, frequent payoffs (docs/08 §2). */
export const JOB_MARBLES = [1, 2, 3] as const;
export const JOB_MINUTES = {min: JOB_MARBLES[0] * MIN_PER_MARBLE, max: JOB_MARBLES[JOB_MARBLES.length - 1] * MIN_PER_MARBLE};

export interface JobDraft {
  title: string;
  minutes: number;
  childIds: string[];
  repeat: Repeat['kind'];
  /** Kept while "Every day" or "Once" is picked, so switching back restores them. */
  days: number[];
  /** Unset on a new job: the server picks one from the title. */
  icon?: JobIcon;
  color: Color;
}

/** New jobs take turns through these; gold is left for time (docs/03 §12) but can still be picked. */
const NEW_JOB_COLORS: Color[] = ['peach', 'mint', 'sky', 'lilac'];
export const SCHOOL_DAYS = [1, 2, 3, 4, 5];

/** A job's minutes made to fit 1–3 marbles (jobs saved when a marble was 5 minutes can be anything). */
export const jobMinutes = (minutes: number) => clampStep(minutes, JOB_MINUTES.min, JOB_MINUTES.max);

/** A new job: one marble, every day, for every kid, the next colour in turn. */
export function newJobDraft(kids: Child[], jobCount: number): JobDraft {
  return {
    title: '',
    minutes: JOB_MINUTES.min,
    childIds: kids.map(kid => kid.id),
    repeat: 'daily',
    days: SCHOOL_DAYS,
    color: NEW_JOB_COLORS[jobCount % NEW_JOB_COLORS.length],
  };
}

export function draftFrom(chore: Chore): JobDraft {
  return {
    title: chore.title,
    minutes: jobMinutes(chore.minutes),
    childIds: chore.childIds,
    repeat: chore.repeat.kind,
    days: chore.repeat.kind === 'weekdays' ? chore.repeat.days : SCHOOL_DAYS,
    icon: chore.icon,
    color: chore.color,
  };
}

/** The body for POST /chores and PATCH /chores/{id}. */
export function toInput(job: JobDraft): ChoreInput {
  const repeat: Repeat = job.repeat === 'weekdays' ? {kind: 'weekdays', days: [...job.days].sort((a, b) => a - b)} : {kind: job.repeat};
  return {
    title: job.title.trim(),
    minutes: jobMinutes(job.minutes),
    childIds: job.childIds,
    repeat,
    color: job.color,
    ...(job.icon ? {icon: job.icon} : {}),
  };
}
