import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import type {Bedtime, Child, ChildPatch, LedgerEntry, PuzzleRound} from '../api/types';
import {useFamily} from '../family';
import type {IconName} from '../icons';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {budgetOf, type Budget} from '../lib/budget';
import {formatMinutes, minutesFromSec, timeAgo} from '../lib/format';
import {usesAmazonKids} from '../lib/handoff';
import {newId} from '../lib/ids';
import {clampStep, MAX_CHANGE_MIN, maxTakeMin} from '../lib/time';
import {useAutosave} from '../lib/useAutosave';
import {useOnChanged} from '../live/LiveContext';
import {Avatar} from '../ui/Avatar';
import {Field, SavedNote, Stepper, Switch} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {KidTime, Stars, TimeLabel} from '../ui/Marbles';
import {NotFound, Page} from '../ui/Page';
import {useShowError, useToast} from '../ui/Toast';
import {MIN_PER_MARBLE} from '../tokens';
import {BudgetFields} from './Budget';
import {CharacterPrompt, CharactersCard} from './Characters';
import {HandoffCard, useHandoffs} from './Handoff';
import {PuzzleFields, type PuzzleSettings} from './KidFields';

/** One kid: their time, a new character to make, the Amazon Kids hand-off, giving (or taking) minutes, the daily budget, puzzles, characters, history. */
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
  // The balance changes on the TV too (approvals there, TV time used).
  useEffect(() => void refresh(), [refresh]);
  const changed = () => setVersion(v => v + 1);
  useOnChanged(changed);
  return (
    <Page
      title={child.name}
      back="/kids"
      action={
        <Link className="btn-round btn-glass" to={`/kids/${child.id}/edit`} aria-label={t('edit')}>
          <Icon name="pencil" />
        </Link>
      }>
      {/* Who, the TV time (one number: what the jar shows, or what Amazon Kids is given), and the stars toward the next character. */}
      <div className="kid-hero">
        <Avatar avatar={child.avatar} color={child.color} size={88} />
        <div className="kid-hero-facts">
          <KidTime child={child} max={12} jar={!amazonKids || child.usedTodaySec > 0} />
          {child.puzzles.on ? (
            <p className="kid-hero-stars" aria-label={t('puzzleStars', {n: child.puzzles.stars, max: child.puzzles.starsNeeded})}>
              <Stars count={child.puzzles.stars} max={child.puzzles.starsNeeded} />
              <span className="meta">{t('starsRule', {max: child.puzzles.starsNeeded})}</span>
            </p>
          ) : null}
        </div>
      </div>
      <CharacterPrompt child={child} />
      {amazonKids ? <KidHandoff child={child} version={version} onChange={changed} /> : null}
      <TimeCard child={child} onDone={changed} />
      <BudgetCard child={child} amazonKids={amazonKids} />
      <BedtimeCard child={child} amazonKids={amazonKids} />
      <PuzzlesCard child={child} version={version} />
      <CharactersCard child={child} />
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

/**
 * POST /children/{id}/adjust with a reason; resolves true when it went through. The same change sent again
 * (after a network error) keeps its id, so the server counts it once.
 */
function useAdjust(child: Child, onDone: () => void) {
  const api = useApi();
  const {update, refresh} = useFamily();
  const {t, lang} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{key: string; id: string} | null>(null);

  const send = async (deltaMin: number, reason: string) => {
    const key = `${deltaMin}|${reason}`;
    if (attempt.current?.key !== key) attempt.current = {key, id: newId()};
    setBusy(true);
    try {
      const result = await api.adjust(child.id, {id: attempt.current.id, deltaMin, reason});
      update(bundle => ({...bundle, children: bundle.children.map(c => (c.id === child.id ? {...c, balanceSec: result.balanceSec} : c))}));
      // A take stops at an empty jar, so tell what was actually taken.
      toast(`${child.name} ${formatMinutes(lang, minutesFromSec(result.entry.deltaSec), true)}`);
      attempt.current = null;
      onDone();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'empty_jar') {
        // The jar emptied in the meantime (TV time used, another grown-up): nothing to take.
        toast(t('emptyJar'));
        void refresh();
      } else {
        showError(error);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {send, busy};
}

/**
 * Positive first: giving minutes is the main action. Taking some away is smaller, needs a reason too (the TV
 * shows it to the kid), and never takes more than was earned.
 */
function TimeCard({child, onDone}: {child: Child; onDone: () => void}) {
  const {t, lang} = useI18n();
  const {send, busy} = useAdjust(child, onDone);
  const [give, setGive] = useState(MIN_PER_MARBLE);
  const [giveReason, setGiveReason] = useState('');
  const [taking, setTaking] = useState(false);
  const [take, setTake] = useState(MIN_PER_MARBLE);
  const [takeReason, setTakeReason] = useState('');
  const maxTake = maxTakeMin(child.balanceSec);
  const canTake = maxTake >= MIN_PER_MARBLE;
  // The jar can shrink while the form is open (a take, TV time used), so keep the amount inside it.
  const takeMin = clampStep(take, MIN_PER_MARBLE, maxTake);

  const submitGive = async (event: FormEvent) => {
    event.preventDefault();
    const why = giveReason.trim();
    if (!why || !(await send(give, why))) return;
    setGive(MIN_PER_MARBLE);
    setGiveReason('');
  };

  const submitTake = async (event: FormEvent) => {
    event.preventDefault();
    const why = takeReason.trim();
    if (!why || !canTake || !(await send(-takeMin, why))) return;
    setTake(MIN_PER_MARBLE);
    setTakeReason('');
    setTaking(false);
  };

  return (
    <section className="card form">
      <form className="form" onSubmit={submitGive}>
        <h2 className="card-title">{t('giveMinutes')}</h2>
        <Stepper value={give} min={MIN_PER_MARBLE} max={MAX_CHANGE_MIN} step={MIN_PER_MARBLE} onChange={setGive}>
          <TimeLabel minutes={give} signed max={8} />
        </Stepper>
        <Field label={t('reason')} counter={`${giveReason.length}/80`}>
          <input value={giveReason} onChange={e => setGiveReason(e.target.value)} placeholder={t('reasonPlaceholder')} maxLength={80} required />
        </Field>
        <button className="btn btn-gold btn-block" disabled={busy || !giveReason.trim()}>
          {t('give', {min: formatMinutes(lang, give)})}
        </button>
      </form>

      <div className="take-away">
        {taking && canTake ? (
          <form className="form" onSubmit={submitTake}>
            <div className="row">
              <h3 className="sub-title grow">{t('takeMinutes')}</h3>
              <button type="button" className="btn-round btn-soft" aria-label={t('cancel')} onClick={() => setTaking(false)}>
                <Icon name="close" />
              </button>
            </div>
            <Stepper value={takeMin} min={MIN_PER_MARBLE} max={maxTake} step={MIN_PER_MARBLE} onChange={setTake}>
              <TimeLabel minutes={-takeMin} max={8} />
            </Stepper>
            <Field label={t('reason')} hint={t('tvShowsReason')} counter={`${takeReason.length}/80`}>
              <input
                value={takeReason}
                onChange={e => setTakeReason(e.target.value)}
                placeholder={t('takeReasonPlaceholder')}
                maxLength={80}
                required
              />
            </Field>
            <button className="btn btn-soft btn-block" disabled={busy || !takeReason.trim()}>
              {t('take', {min: formatMinutes(lang, takeMin)})}
            </button>
          </form>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-soft btn-small" disabled={!canTake} onClick={() => setTaking(true)}>
              <Icon name="minus" size={20} />
              {t('takeMinutes')}
            </button>
            {canTake ? null : <span className="hint">{t('emptyJar')}</span>}
          </div>
        )}
      </div>
    </section>
  );
}

/** PATCH /children/{id} and show the result everywhere. Errors are shown, then passed on, so an autosave tries again. */
function usePatchChild(childId: string) {
  const api = useApi();
  const {update} = useFamily();
  const showError = useShowError();
  return useCallback(
    async (body: ChildPatch) => {
      try {
        const next = await api.patchChild(childId, body);
        update(bundle => ({...bundle, children: bundle.children.map(c => (c.id === next.id ? next : c))}));
      } catch (error) {
        showError(error);
        throw error;
      }
    },
    [api, childId, update, showError],
  );
}

/**
 * The daily budget: the most TV a day (the jar's size) and the free base in it, saved as the grown-up taps.
 * The age sets the ceiling's limit; it's changed in the kid's form.
 */
function BudgetCard({child, amazonKids}: {child: Child; amazonKids: boolean}) {
  const {t} = useI18n();
  const patch = usePatchChild(child.id);
  const [budget, setBudget] = useState<Budget>(() => budgetOf(child));
  const saved = useAutosave(budget, value => patch(value));
  return (
    <section className="card form">
      <h2 className="card-title">
        <Icon name="sun" />
        {t('budgetTitle')}
        {saved ? <SavedNote /> : null}
      </h2>
      <BudgetFields age={child.age} value={budget} amazonKids={amazonKids} onChange={setBudget} />
    </section>
  );
}

/** The subjects a puzzle can be about, by the backend's ids (a new one shows by its id until it has a name here). */
/** Turning bedtime on starts from screens off at 19:00 and back at 07:00 [A] (docs/08, Oct 19). */
const BEDTIME_DEFAULT: Bedtime = {from: '19:00', to: '07:00'};

/**
 * Bedtime: when TV time ends for the night. A TV in strict mode closes video apps for this kid then, whatever is in
 * the jar, and a grown-up can allow 30 more minutes with the PIN on the TV; Amazon Kids has its own bedtime, set
 * there. Saved a moment after a change, like the budget.
 */
function BedtimeCard({child, amazonKids}: {child: Child; amazonKids: boolean}) {
  const {t} = useI18n();
  const patch = usePatchChild(child.id);
  const [bedtime, setBedtime] = useState<Bedtime | null>(() => child.bedtime ?? null);
  // A bedtime that ends when it starts is half typed: nothing is saved until it is a real one.
  const saved = useAutosave(bedtime, value => (value && value.from === value.to ? Promise.resolve() : patch({bedtime: value})));
  const set = (end: keyof Bedtime) => (value: string) => {
    if (bedtime && /^\d\d:\d\d/.test(value)) setBedtime({...bedtime, [end]: value.slice(0, 5)});
  };
  return (
    <section className="card form">
      <h2 className="card-title">
        <Icon name="moon" />
        {t('bedtimeTitle')}
        {saved ? <SavedNote /> : null}
      </h2>
      <div className="setting-row">
        <span className="grow">
          <span className="row-title">{t('bedtimeSetting')}</span>
          <span className="hint">{t(amazonKids ? 'bedtimeHintAmazonKids' : 'bedtimeHint')}</span>
        </span>
        <Switch checked={bedtime !== null} label={t('bedtimeSetting')} onChange={on => setBedtime(on ? (child.bedtime ?? BEDTIME_DEFAULT) : null)} />
      </div>
      {bedtime ? (
        <div className="bedtime-times">
          <Field label={t('bedtimeFrom')}>
            <input type="time" value={bedtime.from} onChange={e => set('from')(e.target.value)} />
          </Field>
          <Field label={t('bedtimeTo')}>
            <input type="time" value={bedtime.to} onChange={e => set('to')(e.target.value)} />
          </Field>
        </div>
      ) : null}
    </section>
  );
}

const SUBJECT: Record<string, Key> = {logic: 'subjectLogic', numbers: 'subjectNumbers', words: 'subjectWords', world: 'subjectWorld'};
/** Rounds listed on the kid's page; the backend keeps more. */
const ROUNDS_SHOWN = 5;

/**
 * Puzzles on the TV for this kid: on or off and how hard, changed right here like the budget (saved a moment after
 * a tap), and how the last rounds went: each question right or missed, and the missed ones in words.
 */
function PuzzlesCard({child, version}: {child: Child; version: number}) {
  const api = useApi();
  const {t, lang} = useI18n();
  const patch = usePatchChild(child.id);
  const [settings, setSettings] = useState<PuzzleSettings>(() => ({puzzles: child.puzzles.on, puzzleLevel: child.puzzles.level}));
  const saved = useAutosave(settings, value => patch(value));
  const [rounds, setRounds] = useState<PuzzleRound[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.puzzleRounds(child.id).then(
      list => {
        if (alive) setRounds(list);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [api, child.id, version]);
  const subject = (id: string) => (SUBJECT[id] ? t(SUBJECT[id]) : id);
  // Where the kid's answers have put them, per subject (only while the difficulty follows the kid).
  const levels = Object.entries(child.puzzles.levels).filter(([id]) => SUBJECT[id]);
  const now = Date.now();
  return (
    <section className="card form">
      <h2 className="card-title">
        <Icon name="puzzle" />
        {t('puzzlesTitle')}
        {saved ? <SavedNote /> : null}
      </h2>
      <PuzzleFields value={settings} levelAges={child.puzzles.levelAges} starsNeeded={child.puzzles.starsNeeded} onChange={change => setSettings(current => ({...current, ...change}))} />
      {settings.puzzles && !settings.puzzleLevel && levels.length ? (
        <p className="meta">{t('puzzleNow', {levels: levels.map(([id, level]) => t('puzzleSubjectLevel', {subject: subject(id), n: level})).join(' · ')})}</p>
      ) : null}
      <h3 className="sub-title">{t('puzzleRoundsTitle')}</h3>
      {rounds && rounds.length === 0 ? <p className="muted-ink">{t('puzzleNoRounds')}</p> : null}
      {rounds && rounds.length > 0 ? (
        <ul className="history">
          {rounds.slice(0, ROUNDS_SHOWN).map(round => {
            const missed = round.answers.filter(answer => !answer.right);
            return (
              <li key={round.at} className="history-row">
                <span className="grow">
                  <span className="round-line">
                    <span className="round-marks" aria-hidden="true">
                      {round.answers.map((answer, i) => (
                        <span key={i} className={`round-mark${answer.right ? ' round-mark-right' : ''}`}>
                          {answer.right ? <Icon name="check" size={12} /> : null}
                        </span>
                      ))}
                    </span>
                    <span className="history-reason">{t('puzzleRoundScore', {n: round.right, max: round.total})}</span>
                  </span>
                  <span className="meta">{timeAgo(lang, round.at, now)}</span>
                  {missed.map((answer, i) => (
                    <span key={i} className="round-missed">
                      {t('puzzleMissed')} {answer.prompt} <span className="meta">({t('puzzleSubjectLevel', {subject: subject(answer.subject), n: answer.level})})</span>
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
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
  HANDOFF: {icon: 'tv', label: 'entryHandoff'},
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
