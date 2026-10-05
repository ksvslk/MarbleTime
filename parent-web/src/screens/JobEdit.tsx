import {useState, type FormEvent} from 'react';
import {useNavigate, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import {jobIconValues, type Chore, type ChoreInput, type Color, type JobIcon, type Repeat} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {weekdayName} from '../lib/format';
import {Avatar} from '../ui/Avatar';
import {ColorPicker} from '../ui/ColorPicker';
import {Confirm} from '../ui/Confirm';
import {Chip, Field, Group, Stepper} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {JobCardPreview, JobTile} from '../ui/JobTile';
import {TimeLabel} from '../ui/Marbles';
import {NotFound, Page} from '../ui/Page';
import {useShowError} from '../ui/Toast';
import {MIN_PER_MARBLE} from '../tokens';

/** /jobs/new and /jobs/:id: what to do, how many marbles, for whom, how often, picture and colour. */
export function JobEdit() {
  const {id} = useParams();
  const {bundle} = useFamily();
  const existing = id ? bundle.chores.find(chore => chore.id === id) : undefined;
  if (id && !existing) return <NotFound back="/jobs" />;
  return <JobForm key={id ?? 'new'} existing={existing} />;
}

interface JobDraft {
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
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7];
const SCHOOL_DAYS = [1, 2, 3, 4, 5];

const toggled = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

function draftFrom(chore: Chore): JobDraft {
  return {
    title: chore.title,
    minutes: chore.minutes,
    childIds: chore.childIds,
    repeat: chore.repeat.kind,
    days: chore.repeat.kind === 'weekdays' ? chore.repeat.days : SCHOOL_DAYS,
    icon: chore.icon,
    color: chore.color,
  };
}

function toInput(job: JobDraft): ChoreInput {
  const repeat: Repeat = job.repeat === 'weekdays' ? {kind: 'weekdays', days: [...job.days].sort((a, b) => a - b)} : {kind: job.repeat};
  return {title: job.title.trim(), minutes: job.minutes, childIds: job.childIds, repeat, color: job.color, ...(job.icon ? {icon: job.icon} : {})};
}

function JobForm({existing}: {existing?: Chore}) {
  const api = useApi();
  const {bundle, update} = useFamily();
  const {t, lang} = useI18n();
  const navigate = useNavigate();
  const showError = useShowError();
  const [job, setJob] = useState<JobDraft>(() =>
    existing
      ? draftFrom(existing)
      : {
          title: '',
          minutes: 2 * MIN_PER_MARBLE,
          childIds: bundle.children.map(child => child.id),
          repeat: 'daily',
          days: SCHOOL_DAYS,
          color: NEW_JOB_COLORS[bundle.chores.length % NEW_JOB_COLORS.length],
        },
  );
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<JobDraft>) => setJob(current => ({...current, ...patch}));

  const noKids = job.childIds.length === 0;
  const noDays = job.repeat === 'weekdays' && job.days.length === 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!job.title.trim() || noKids || noDays) return;
    setBusy(true);
    try {
      const saved = existing ? await api.patchChore(existing.id, toInput(job)) : await api.addChore(toInput(job));
      update(b => ({...b, chores: existing ? b.chores.map(c => (c.id === saved.id ? saved : c)) : [...b.chores, saved]}));
      navigate('/jobs', {replace: true});
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await api.removeChore(existing.id);
      update(b => ({...b, chores: b.chores.filter(c => c.id !== existing.id)}));
      navigate('/jobs', {replace: true});
    } catch (error) {
      showError(error);
      setBusy(false);
      setConfirming(false);
    }
  };

  const chooseIcon = (icon: JobIcon | undefined) => {
    set({icon});
    setPicking(false);
  };

  return (
    <Page title={existing ? existing.title : t('newJob')} back="/jobs">
      <JobCardPreview icon={job.icon ?? 'sparkle'} color={job.color} title={job.title.trim()} minutes={job.minutes} />
      <form className="card form" onSubmit={save} noValidate>
        <Field label={t('jobTitle')} counter={`${job.title.length}/60`}>
          <input value={job.title} onChange={e => set({title: e.target.value})} placeholder={t('jobTitlePlaceholder')} maxLength={60} required />
        </Field>

        <Group label={t('tvTime')}>
          <Stepper value={job.minutes} min={MIN_PER_MARBLE} max={120} step={MIN_PER_MARBLE} onChange={minutes => set({minutes})}>
            <TimeLabel minutes={job.minutes} max={8} />
          </Stepper>
        </Group>

        <Group label={t('forKids')} error={tried && noKids ? t('pickKid') : undefined}>
          <div className="chips">
            {bundle.children.map(child => (
              <Chip key={child.id} selected={job.childIds.includes(child.id)} onClick={() => set({childIds: toggled(job.childIds, child.id)})}>
                <Avatar avatar={child.avatar} color={child.color} size={28} />
                {child.name}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label={t('howOften')} error={tried && noDays ? t('pickDay') : undefined}>
          <div className="chips">
            <Chip selected={job.repeat === 'daily'} onClick={() => set({repeat: 'daily'})}>
              {t('everyDay')}
            </Chip>
            <Chip selected={job.repeat === 'weekdays'} onClick={() => set({repeat: 'weekdays'})}>
              {t('someDays')}
            </Chip>
            <Chip selected={job.repeat === 'once'} onClick={() => set({repeat: 'once'})}>
              {t('once')}
            </Chip>
          </div>
          {job.repeat === 'weekdays' ? (
            <div className="chips days">
              {ISO_DAYS.map(day => (
                <Chip key={day} selected={job.days.includes(day)} onClick={() => set({days: toggled(job.days, day)})}>
                  {weekdayName(lang, day)}
                </Chip>
              ))}
            </div>
          ) : null}
        </Group>

        <Group label={t('picture')} hint={job.icon ? undefined : t('pictureAutoHint')}>
          <div className="row">
            <JobTile icon={job.icon ?? 'sparkle'} color={job.color} />
            <span className="grow">{job.icon ? null : t('pictureAuto')}</span>
            <button type="button" className="btn btn-soft btn-small" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              {t('change')}
            </button>
          </div>
          {picking ? (
            <div className="icon-grid">
              {existing ? null : (
                <button type="button" className="icon-pick" aria-pressed={!job.icon} aria-label={t('pictureAuto')} onClick={() => chooseIcon(undefined)}>
                  <Icon name="sparkle" size={28} />
                </button>
              )}
              {jobIconValues.map(icon => (
                <button key={icon} type="button" className="icon-pick" aria-pressed={job.icon === icon} aria-label={icon} onClick={() => chooseIcon(icon)}>
                  <Icon name={icon} size={28} />
                </button>
              ))}
            </div>
          ) : null}
        </Group>

        <Group label={t('colour')}>
          <ColorPicker value={job.color} onChange={color => set({color})} />
        </Group>

        <button className="btn btn-gold btn-block" disabled={busy || !job.title.trim()}>
          {t('save')}
        </button>
      </form>

      {existing ? (
        <>
          <button type="button" className="btn btn-glass btn-block" onClick={() => setConfirming(true)}>
            <Icon name="trash" />
            {t('remove')}
          </button>
          <Confirm
            open={confirming}
            title={t('removeJobQ')}
            text={t('removeJobHint')}
            confirmLabel={t('remove')}
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </Page>
  );
}
