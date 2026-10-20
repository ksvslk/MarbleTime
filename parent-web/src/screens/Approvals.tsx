import {useRef, useState} from 'react';
import {Link} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import {type Child, type Chore, type Claim, NOT_YET_REASONS, type NotYetReason} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {timeAgo} from '../lib/format';
import {usesAmazonKids} from '../lib/handoff';
import {rewardText} from '../lib/rewards';
import {usePolling} from '../lib/usePolling';
import {useLive, useOnChanged} from '../live/LiveContext';
import {Avatar} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {JobTile, RoutineLabel} from '../ui/JobTile';
import {TimeLabel} from '../ui/Marbles';
import {Empty, Page} from '../ui/Page';
import {isOffline, useShowError, useToast} from '../ui/Toast';
import {CharacterPrompt} from './Characters';
import {HandoffCard, useHandoffs} from './Handoff';
import {NotifyCard} from './Notify';

/** Without a live connection, look for new claims every 3 s; with one, the server says when (polling is the backup). */
const POLL_MS = 3000;
const LIVE_POLL_MS = 30000;
const HANDOFF_POLL_MS = 30000;
/** How long a decided card takes to lift away (matches .claim.leaving in styles.css). */
const LEAVE_MS = 260;

const newestFirst = (a: Claim, b: Claim) => b.createdAt - a.createdAt;

/**
 * Home: jobs the kids say are done, one tap each, and what each "Yes" gave (marbles, a new character when the
 * jar was full, or praise for a routine job). Then new characters to make, and in Amazon Kids mode the time to
 * hand off.
 */
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
  const {connected} = useLive();

  const poll = async () => {
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
  };
  usePolling(poll, connected ? LIVE_POLL_MS : POLL_MS);
  // Bonuses from another grown-up and decisions on the TV change hand-offs without any claim here, so look now and then as well.
  usePolling(() => handoffs.refresh(), HANDOFF_POLL_MS);
  useOnChanged(() => {
    void poll();
    void handoffs.refresh();
  });

  /** Called once the card has lifted away: drop it, tell the server, and put it back if that fails. */
  const decide = async (claim: Claim, yes: boolean, reason?: NotYetReason) => {
    decided.current.add(claim.id);
    setClaims(list => list?.filter(c => c.id !== claim.id) ?? list);
    try {
      const decided = await (yes ? api.approve(claim.id) : api.reject(claim.id, reason));
      if (yes) {
        const kid = bundle.children.find(child => child.id === claim.childId);
        toast(rewardText(lang, decided ?? claim, kid?.name ?? '').trim());
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
  const withCharacters = bundle.children.filter(child => (child.characterTokens ?? 0) > 0);

  return (
    <Page title={t('waitingTitle')}>
      <NotifyCard />
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
              onDecide={(yes, reason) => void decide(claim, yes, reason)}
            />
          ))}
        </ul>
      )}

      {withCharacters.map(child => (
        <CharacterPrompt key={child.id} child={child} />
      ))}

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

/**
 * One job a kid says is done: the job's picture with the kid on it, the title, what a yes gives (what the kid's card
 * showed on the TV), Yes / Not yet. "Not yet" asks what the kid should hear, so they know what to do next.
 */
function ClaimCard({claim, kid, job, onDecide}: {claim: Claim; kid?: Child; job?: Chore; onDecide: (yes: boolean, reason?: NotYetReason) => void}) {
  const {t, lang} = useI18n();
  const [leaving, setLeaving] = useState(false);
  const [asking, setAsking] = useState(false);
  // A decision lifts the card away first, as on the TV; one tap only.
  const decide = (yes: boolean, reason?: NotYetReason) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onDecide(yes, reason), LEAVE_MS);
  };
  // Claims from before promises say what the job is worth.
  const gives = claim.promised ?? {reward: 'marbles' as const, minutes: claim.minutes};
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
          {gives.reward === 'praise' ? <RoutineLabel label={t('routine')} /> : gives.minutes > 0 ? <TimeLabel minutes={gives.minutes} signed /> : null}
          {gives.reward === 'character' ? <p className="meta">{t(gives.minutes > 0 ? 'givesBoth' : 'givesCharacter')}</p> : null}
        </div>
      </div>
      {asking ? (
        <>
          <p className="meta">{t('notYetWhy', {kid: kid?.name ?? ''})}</p>
          <div className="list">
            {NOT_YET_REASONS.map(reason => (
              <button key={reason} type="button" className="btn btn-soft" disabled={leaving} onClick={() => decide(false, reason)}>
                {t(`reason_${reason}`)}
              </button>
            ))}
            <button type="button" className="btn btn-soft" disabled={leaving} onClick={() => decide(false)}>
              {t('reasonNone')}
            </button>
          </div>
        </>
      ) : (
        <div className="button-row">
          <button type="button" className="btn btn-gold" disabled={leaving} onClick={() => decide(true)}>
            <Icon name="check" />
            {t('yes')}
          </button>
          <button type="button" className="btn btn-soft" disabled={leaving} onClick={() => setAsking(true)}>
            {t('notYet')}
          </button>
        </div>
      )}
    </li>
  );
}
