import {useRef, useState} from 'react';
import {Link} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import type {Child, Chore, Claim} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {formatMinutes, timeAgo} from '../lib/format';
import {usesAmazonKids} from '../lib/handoff';
import {usePolling} from '../lib/usePolling';
import {Avatar} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {JobTile} from '../ui/JobTile';
import {TimeLabel} from '../ui/Marbles';
import {Empty, Page} from '../ui/Page';
import {isOffline, useShowError, useToast} from '../ui/Toast';
import {HandoffCard, useHandoffs} from './Handoff';

const POLL_MS = 3000;
const HANDOFF_POLL_MS = 30000;
/** How long a decided card takes to lift away (matches .claim.leaving in styles.css). */
const LEAVE_MS = 260;

const newestFirst = (a: Claim, b: Claim) => b.createdAt - a.createdAt;

/** Home: jobs the kids say are done, one tap each. Then, in Amazon Kids mode, the time to hand off. */
export function Approvals() {
  const api = useApi();
  const {bundle, refresh} = useFamily();
  const {t, lang} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [problem, setProblem] = useState<'offline' | 'error' | null>(null);
  /** Decided here but maybe still in a poll that started before the decision. */
  const decided = useRef(new Set<string>());
  const lastIds = useRef<string[]>([]);
  const amazonKids = usesAmazonKids(bundle.devices);
  const handoffs = useHandoffs(amazonKids ? bundle.children.map(child => child.id) : []);

  usePolling(async () => {
    try {
      const list = await api.claims('waiting');
      setProblem(null);
      const ids = list.map(claim => claim.id);
      for (const id of decided.current) if (!ids.includes(id)) decided.current.delete(id);
      // A claim left the list: someone decided it (maybe on the TV), so balances and hand-offs changed.
      if (lastIds.current.some(id => !ids.includes(id))) {
        void refresh();
        void handoffs.refresh();
      }
      lastIds.current = ids;
      setClaims(list.filter(claim => !decided.current.has(claim.id)));
    } catch (error) {
      setProblem(isOffline(error) ? 'offline' : 'error');
    }
  }, POLL_MS);
  // Brain games add hand-off time without any claim changing, so look now and then as well.
  usePolling(() => handoffs.refresh(), HANDOFF_POLL_MS);

  /** Called once the card has lifted away: drop it, tell the server, and put it back if that fails. */
  const decide = async (claim: Claim, yes: boolean) => {
    decided.current.add(claim.id);
    setClaims(list => list?.filter(c => c.id !== claim.id) ?? list);
    try {
      await (yes ? api.approve(claim.id) : api.reject(claim.id));
      if (yes) {
        const kid = bundle.children.find(child => child.id === claim.childId);
        toast(`${kid?.name ?? ''} ${formatMinutes(lang, claim.minutes, true)}`.trim());
        void handoffs.refresh([claim.childId]);
      }
      void refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Decided elsewhere first (a grown-up on the TV): nothing to undo here.
        toast(t('alreadyDecided'));
        void refresh();
        void handoffs.refresh([claim.childId]);
        return;
      }
      decided.current.delete(claim.id);
      setClaims(list => (list && !list.some(c => c.id === claim.id) ? [...list, claim].sort(newestFirst) : list));
      showError(error);
    }
  };

  const pending = bundle.children.filter(child => (handoffs.byChild[child.id]?.pendingMinutes ?? 0) > 0);

  return (
    <Page title={t('waitingTitle')}>
      {problem ? (
        <p className="banner" role="status">
          {t(problem === 'offline' ? 'errorOffline' : 'errorGeneric')}
        </p>
      ) : null}

      {claims === null ? null : bundle.children.length === 0 ? (
        <Empty icon="kids" title={t('noKidsYet')}>
          <Link className="btn btn-gold" to="/kids/new">
            {t('addKid')}
          </Link>
        </Empty>
      ) : claims.length === 0 ? (
        <Empty icon="hourglass" title={t('noneWaiting')} hint={t('noneWaitingHint')} />
      ) : (
        <ul className="list">
          {claims.map(claim => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              kid={bundle.children.find(child => child.id === claim.childId)}
              job={bundle.chores.find(chore => chore.id === claim.choreId)}
              onDecide={yes => void decide(claim, yes)}
            />
          ))}
        </ul>
      )}

      {pending.length ? (
        <section className="section">
          <h2 className="section-title">{t('handoffTitle')}</h2>
          <div className="list">
            {pending.map(child => (
              <HandoffCard key={child.id} child={child} handoff={handoffs.byChild[child.id]} onChange={handoff => handoffs.set(child.id, handoff)} />
            ))}
          </div>
        </section>
      ) : null}
    </Page>
  );
}

/** One job a kid says is done: the job's picture with the kid on it, the title, the marbles, Yes / Not yet. */
function ClaimCard({claim, kid, job, onDecide}: {claim: Claim; kid?: Child; job?: Chore; onDecide: (yes: boolean) => void}) {
  const {t, lang} = useI18n();
  const [leaving, setLeaving] = useState(false);
  // A decision lifts the card away first, as on the TV; one tap only.
  const decide = (yes: boolean) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onDecide(yes), LEAVE_MS);
  };
  return (
    <li className={`card claim${leaving ? ' leaving' : ''}`}>
      <div className="claim-top">
        <JobTile icon={job?.icon ?? 'star'} color={job?.color ?? 'peach'} size={72}>
          {kid ? (
            <span className="tile-badge">
              <Avatar avatar={kid.avatar} color={kid.color} size={36} />
            </span>
          ) : null}
        </JobTile>
        <div className="grow">
          <h2 className="claim-title">{claim.choreTitle ?? job?.title ?? ''}</h2>
          <p className="meta">{t('saysDone', {kid: kid?.name ?? '', ago: timeAgo(lang, claim.createdAt, Date.now())})}</p>
          <TimeLabel minutes={claim.minutes} signed />
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-gold" disabled={leaving} onClick={() => decide(true)}>
          <Icon name="check" />
          {t('yes')}
        </button>
        <button type="button" className="btn btn-soft" disabled={leaving} onClick={() => decide(false)}>
          {t('notYet')}
        </button>
      </div>
    </li>
  );
}
