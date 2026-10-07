import {Link} from 'react-router';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {repeatSummary} from '../lib/format';
import {Avatar} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {JobTile, RoutineLabel} from '../ui/JobTile';
import {TimeLabel} from '../ui/Marbles';
import {Empty, Page} from '../ui/Page';

/** Every job, with its marbles (or "Routine"), how often it repeats and whose it is. */
export function Jobs() {
  const {bundle} = useFamily();
  const {t, lang} = useI18n();
  const kids = new Map(bundle.children.map(child => [child.id, child]));
  const addJob = (
    <Link className="btn btn-glass btn-small" to="/jobs/new">
      <Icon name="plus" size={20} />
      {t('addJob')}
    </Link>
  );

  return (
    <Page title={t('tabJobs')} action={bundle.chores.length ? addJob : undefined}>
      {bundle.chores.length === 0 ? (
        <Empty icon="list" title={t('noJobs')} hint={t('noJobsHint')}>
          <Link className="btn btn-gold" to="/jobs/new">
            <Icon name="plus" />
            {t('addJob')}
          </Link>
        </Empty>
      ) : (
        <ul className="list">
          {bundle.chores.map(chore => (
            <li key={chore.id}>
              <Link className="card row link-card" to={`/jobs/${chore.id}`}>
                <JobTile icon={chore.icon} color={chore.color} />
                <span className="grow">
                  <span className="row-title">{chore.title}</span>
                  <span className="job-meta">
                    {chore.routine ? <RoutineLabel label={t('routine')} /> : <TimeLabel minutes={chore.minutes} max={6} />}
                    <span className="meta">{repeatSummary(lang, chore.repeat)}</span>
                  </span>
                </span>
                <span className="avatar-stack">
                  {chore.childIds.map(id => {
                    const kid = kids.get(id);
                    return kid ? <Avatar key={id} avatar={kid.avatar} color={kid.color} size={28} /> : null;
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
