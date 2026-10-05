import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import {topicValues, type Child, type LedgerEntry, type Topic} from '../api/types';
import {useFamily} from '../family';
import type {IconName} from '../icons';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {formatMinutes, minutesFromSec, timeAgo} from '../lib/format';
import {usesAmazonKids} from '../lib/handoff';
import {newId} from '../lib/ids';
import {useAutosave} from '../lib/useAutosave';
import {Avatar} from '../ui/Avatar';
import {Chip, Field, Group, Stepper} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {TimeLabel} from '../ui/Marbles';
import {NotFound, Page} from '../ui/Page';
import {useShowError, useToast} from '../ui/Toast';
import {MIN_PER_MARBLE} from '../tokens';
import {HandoffCard, useHandoffs} from './Handoff';

/** One kid: their time, the Amazon Kids hand-off, ± minutes, brain-game settings and history. */
export function KidDetail() {
  const {id = ''} = useParams();
  const {bundle} = useFamily();
  const child = bundle.children.find(c => c.id === id);
  if (!child) return <NotFound back="/kids" />;
  return <KidPage key={child.id} child={child} amazonKids={usesAmazonKids(bundle.devices)} />;
}

function KidPage({child, amazonKids}: {child: Child; amazonKids: boolean}) {
  const {refresh} = useFamily();
  const {t} = useI18n();
  // Bumped after anything that adds ledger entries, so history and the hand-off load again.
  const [version, setVersion] = useState(0);
  // The balance changes on the TV too (brain games, approvals there).
  useEffect(() => void refresh(), [refresh]);
  const changed = () => setVersion(v => v + 1);
  return (
    <Page
      title={child.name}
      back="/kids"
      action={
        <Link className="btn-round btn-glass" to={`/kids/${child.id}/edit`} aria-label={t('edit')}>
          <Icon name="pencil" />
        </Link>
      }>
      <div className="kid-hero">
        <Avatar avatar={child.avatar} color={child.color} size={88} />
        <TimeLabel minutes={minutesFromSec(child.balanceSec)} max={12} />
      </div>
      {amazonKids ? <KidHandoff child={child} version={version} onChange={changed} /> : null}
      <AdjustCard child={child} onDone={changed} />
      <GamesCard child={child} />
      <HistoryCard child={child} version={version} amazonKids={amazonKids} />
    </Page>
  );
}

function KidHandoff({child, version, onChange}: {child: Child; version: number; onChange: () => void}) {
  const {t} = useI18n();
  const handoffs = useHandoffs([child.id]);
  const {refresh} = handoffs;
  useEffect(() => void refresh(), [refresh, version]);
  const handoff = handoffs.byChild[child.id];
  if (!handoff || handoff.pendingMinutes <= 0) return null;
  return (
    <HandoffCard
      child={child}
      handoff={handoff}
      title={t('handoffTitle')}
      onChange={next => {
        handoffs.set(child.id, next);
        onChange();
      }}
    />
  );
}

const MAX_ADJUST = 120;

/** Bonus or penalty in 5-minute steps (never 0), with a reason: POST /children/{id}/adjust. */
function AdjustCard({child, onDone}: {child: Child; onDone: () => void}) {
  const api = useApi();
  const {update} = useFamily();
  const {t, lang} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [delta, setDelta] = useState(MIN_PER_MARBLE);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // The same change sent again (after a network error) keeps its id, so the server counts it once.
  const attempt = useRef<{key: string; id: string} | null>(null);
  const minutes = formatMinutes(lang, Math.abs(delta));

  const step = (next: number) => setDelta(next === 0 ? (delta > 0 ? -MIN_PER_MARBLE : MIN_PER_MARBLE) : next);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const why = reason.trim();
    if (!why) return;
    const key = `${delta}|${why}`;
    if (attempt.current?.key !== key) attempt.current = {key, id: newId()};
    setBusy(true);
    try {
      const result = await api.adjust(child.id, {id: attempt.current.id, deltaMin: delta, reason: why});
      update(bundle => ({...bundle, children: bundle.children.map(c => (c.id === child.id ? {...c, balanceSec: result.balanceSec} : c))}));
      toast(`${child.name} ${formatMinutes(lang, delta, true)}`);
      attempt.current = null;
      setReason('');
      setDelta(MIN_PER_MARBLE);
      onDone();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2 className="card-title">{t('changeTime')}</h2>
      <Stepper value={delta} min={-MAX_ADJUST} max={MAX_ADJUST} step={MIN_PER_MARBLE} onChange={step}>
        <TimeLabel minutes={delta} signed max={8} />
      </Stepper>
      <Field label={t('reason')} counter={`${reason.length}/80`}>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reasonPlaceholder')} maxLength={80} required />
      </Field>
      <button className="btn btn-gold btn-block" disabled={busy || !reason.trim()}>
        {delta > 0 ? t('give', {min: minutes}) : t('take', {min: minutes})}
      </button>
    </form>
  );
}

const TOPIC_NAMES: Record<Topic, Key> = {numbers: 'topicNumbers', words: 'topicWords', puzzles: 'topicPuzzles'};

/** Age, allowed topics and the daily game-marble cap. Saved as the grown-up taps, like on the TV. */
function GamesCard({child}: {child: Child}) {
  const api = useApi();
  const {update} = useFamily();
  const {t, lang} = useI18n();
  const showError = useShowError();
  const [draft, setDraft] = useState({age: child.age, topics: child.games.topics, cap: child.games.dailyCapMarbles});
  const [saved, setSaved] = useState(false);

  useAutosave(draft, async value => {
    try {
      const next = await api.patchChild(child.id, {age: value.age, games: {topics: value.topics, dailyCapMarbles: value.cap}});
      update(bundle => ({...bundle, children: bundle.children.map(c => (c.id === next.id ? next : c))}));
      setSaved(true);
    } catch (error) {
      showError(error);
      throw error;
    }
  });
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  const toggle = (topic: Topic) =>
    setDraft(current => {
      const on = new Set(current.topics);
      if (on.has(topic)) on.delete(topic);
      else on.add(topic);
      return {...current, topics: topicValues.filter(x => on.has(x))};
    });

  return (
    <section className="card form">
      <h2 className="card-title">
        <Icon name="shapes" />
        {t('brainGames')}
        {saved ? (
          <span className="saved" role="status">
            <Icon name="check" size={18} />
            {t('saved')}
          </span>
        ) : null}
      </h2>
      <Group label={t('age')} hint={t('ageHint')}>
        <Stepper value={draft.age} min={3} max={12} onChange={age => setDraft(current => ({...current, age}))}>
          <span className="stepper-number">{draft.age}</span>
        </Stepper>
      </Group>
      <Group label={t('games')} hint={t('gamesHint')}>
        <div className="chips">
          {topicValues.map(topic => (
            <Chip key={topic} selected={draft.topics.includes(topic)} onClick={() => toggle(topic)}>
              {draft.topics.includes(topic) ? <Icon name="check" size={18} /> : null}
              {t(TOPIC_NAMES[topic])}
            </Chip>
          ))}
        </div>
      </Group>
      <Group label={t('dailyCap')} hint={t('dailyCapHint')}>
        <Stepper value={draft.cap} min={0} max={12} onChange={cap => setDraft(current => ({...current, cap}))}>
          <span className="stepper-number">{draft.cap}</span>
          <span className="muted-ink">= {formatMinutes(lang, draft.cap * MIN_PER_MARBLE)}</span>
        </Stepper>
      </Group>
    </section>
  );
}

const ENTRY: Record<LedgerEntry['type'], {icon: IconName; label: Key}> = {
  CHORE: {icon: 'check', label: 'entryChore'},
  GAME: {icon: 'shapes', label: 'entryGame'},
  BONUS: {icon: 'plus', label: 'entryBonus'},
  PENALTY: {icon: 'minus', label: 'entryPenalty'},
  USAGE: {icon: 'tv', label: 'entryUsage'},
  ALLOWANCE: {icon: 'sun', label: 'entryAllowance'},
  ADJUST: {icon: 'pencil', label: 'entryAdjust'},
};

const HANDOFF_LABEL: Record<NonNullable<LedgerEntry['handoff']>, Key> = {
  PENDING: 'handoffPending',
  DONE: 'handoffDone',
  SKIPPED: 'handoffSkipped',
};

/** The kid's ledger, newest first (GET /children/{id}/ledger). */
function HistoryCard({child, version, amazonKids}: {child: Child; version: number; amazonKids: boolean}) {
  const api = useApi();
  const {t, lang} = useI18n();
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.ledger(child.id).then(
      list => {
        if (!alive) return;
        setEntries(list);
        setFailed(false);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [api, child.id, version]);

  const now = Date.now();
  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="clock" />
        {t('history')}
      </h2>
      {failed ? <p className="muted-ink">{t('errorGeneric')}</p> : null}
      {entries && entries.length === 0 ? <p className="muted-ink">{t('noHistory')}</p> : null}
      {entries && entries.length > 0 ? (
        <ul className="history">
          {entries.map(entry => {
            const kind = ENTRY[entry.type];
            const minutes = minutesFromSec(entry.deltaSec);
            return (
              <li key={entry.id} className="history-row">
                <span className="history-icon">
                  <Icon name={kind.icon} size={20} />
                </span>
                <span className="grow">
                  <span className="history-reason">{entry.reason || t(kind.label)}</span>
                  <span className="meta">
                    {t(kind.label)} · {timeAgo(lang, entry.createdAt, now)}
                  </span>
                  {amazonKids && entry.handoff ? (
                    <span className={`handoff-tag handoff-${entry.handoff.toLowerCase()}`}>
                      <Icon name={entry.handoff === 'PENDING' ? 'hourglass' : 'check'} size={14} />
                      {t(HANDOFF_LABEL[entry.handoff])}
                    </span>
                  ) : null}
                </span>
                <span className={`delta${minutes < 0 ? ' delta-minus' : ''}`}>{formatMinutes(lang, minutes, true)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
