import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useLocation, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import type {Child} from '../api/types';
import {useFamily} from '../family';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {follow, IDEA_MAX, sendIdea, type Flow} from '../lib/characters';
import {canRecord, startRecording, type Recording} from '../lib/recorder';
import {MAX_SPEECH_SEC} from '../lib/wav';
import {Avatar} from '../ui/Avatar';
import {Field} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Empty, NotFound, Page} from '../ui/Page';
import {useShowError} from '../ui/Toast';
import {CharacterArt, useCharacters} from './Characters';

/**
 * /kids/:id/character: the kid says what their new character should be (recorded on this phone, or typed),
 * the server's art director reads it, and the drawing shows up here when it's ready. A list item's "Try other
 * words" brings the earlier words along (router state).
 */
export function CharacterNew() {
  const {id = ''} = useParams();
  const {bundle} = useFamily();
  const child = bundle.children.find(c => c.id === id);
  if (!child) return <NotFound back="/kids" />;
  return <CharacterMaker key={child.id} child={child} />;
}

function CharacterMaker({child}: {child: Child}) {
  const api = useApi();
  const {refresh} = useFamily();
  const {t} = useI18n();
  const showError = useShowError();
  const carried = (useLocation().state as {words?: unknown} | null)?.words;
  const [flow, setFlow] = useState<Flow>({step: 'idea', words: typeof carried === 'string' ? carried.slice(0, IDEA_MAX) : ''});
  const {characters} = useCharacters(child.id, flow.step === 'drawing');

  // The character being drawn moves on (ready, needs_help) as fresh lists arrive.
  useEffect(() => {
    if (characters) setFlow(current => follow(current, characters));
  }, [characters]);

  const setWords = (words: string) => setFlow(current => (current.step === 'idea' ? {...current, words} : current));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (flow.step !== 'idea' || !flow.words.trim()) return;
    const {words} = flow;
    setFlow({step: 'sending', words});
    try {
      setFlow(await sendIdea(api, child.id, words));
    } catch (error) {
      showError(error);
      setFlow({step: 'idea', words});
    }
    void refresh(); // the kid's character tokens changed (or someone else's did, for 409)
  };

  const back = `/kids/${child.id}`;
  let content;
  if (flow.step === 'no_tokens' || (flow.step === 'idea' && (child.characterTokens ?? 0) <= 0)) {
    content = (
      <Empty icon="sparkle" title={t('noTokens')} hint={t('jarFullRule')}>
        <Link className="btn btn-glass" to={back}>
          {t('back')}
        </Link>
      </Empty>
    );
  } else if (flow.step === 'idea' || flow.step === 'sending') {
    content = <IdeaForm child={child} flow={flow} onWords={setWords} onSubmit={submit} />;
  } else {
    const {character} = flow;
    content = (
      <section className="card character-stage" aria-live="polite">
        <CharacterArt character={character} color={child.color} size={flow.step === 'ready' ? 240 : 160} />
        {character.name ? <h2 className="character-title">{character.name}</h2> : null}
        <p className="hint">“{character.description}”</p>
        {flow.step === 'drawing' ? (
          <>
            <p className="stage-status">{t('drawing')}</p>
            <p className="hint">{t('drawingLeave')}</p>
            <Link className="btn btn-soft btn-block" to={back}>
              {t('done')}
            </Link>
          </>
        ) : null}
        {flow.step === 'ready' ? (
          <>
            <p className="stage-status">{t('characterReady')}</p>
            <Link className="btn btn-gold btn-block" to={back}>
              {t('done')}
            </Link>
          </>
        ) : null}
        {flow.step === 'needs_help' ? (
          <>
            <p className="stage-status">{t('characterNeedsHelp')}</p>
            <button type="button" className="btn btn-gold btn-block" onClick={() => setFlow({step: 'idea', words: character.description})}>
              {t('tryOtherWords')}
            </button>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <Page title={t('newCharacter')} back={back}>
      {content}
    </Page>
  );
}

/** Who it's for, the mic, the words (editable, or typed), and "Draw it". After a 422, the sentence to read to the kid. */
function IdeaForm({child, flow, onWords, onSubmit}: {
  child: Child;
  flow: Extract<Flow, {step: 'idea' | 'sending'}>;
  onWords: (words: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const {t} = useI18n();
  const sending = flow.step === 'sending';
  const notOk = flow.step === 'idea' ? flow.notOk : undefined;
  return (
    <form className="card form" onSubmit={onSubmit}>
      <div className="row">
        <Avatar avatar={child.avatar} color={child.color} size={52} />
        <p className="row-title grow">{child.name}</p>
      </div>
      {notOk !== undefined ? (
        <div className="callout" role="status">
          <p className="callout-label">{t('readThis')}</p>
          <p className="callout-text" lang="en">
            {notOk || t('tryOtherWords')}
          </p>
        </div>
      ) : (
        <p className="hint">{t('characterAsk')}</p>
      )}
      <SpeechInput disabled={sending} onText={onWords} />
      <Field label={t('idea')} hint={t('ideaHint')} counter={`${flow.words.length}/${IDEA_MAX}`}>
        <textarea
          value={flow.words}
          onChange={e => onWords(e.target.value)}
          placeholder={t('ideaPlaceholder')}
          maxLength={IDEA_MAX}
          rows={3}
          lang="en"
          disabled={sending}
        />
      </Field>
      <button className="btn btn-gold btn-block" disabled={sending || !flow.words.trim()}>
        <Icon name="sparkle" />
        {t(sending ? 'readingIdea' : 'drawIt')}
      </button>
    </form>
  );
}

type MicProblem = Extract<Key, 'micNothing' | 'micDenied' | 'micTooLong' | 'micUnavailable'>;

/**
 * Recording on this phone: tap to start, tap to stop (or it stops at 15 s), then the words come back from
 * POST /speech-to-text into the text box, where the grown-up can fix them.
 */
function useSpeech(onText: (text: string) => void) {
  const api = useApi();
  const showError = useShowError();
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [clock, setClock] = useState({start: 0, now: 0});
  const recording = useRef<Recording | null>(null);
  const latestOnText = useRef(onText);
  useEffect(() => {
    latestOnText.current = onText;
  });

  const stop = useCallback(async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setState('working');
    try {
      const text = (await api.speechToText(await current.stop())).trim();
      if (text) latestOnText.current(text);
      else setProblem('micNothing');
    } catch (error) {
      if (!(error instanceof ApiError)) setProblem('micNothing'); // nothing could be decoded: nothing was recorded
      else if (error.status === 413) setProblem('micTooLong');
      else showError(error);
    } finally {
      setState('idle');
    }
  }, [api, showError]);

  const start = useCallback(async () => {
    setProblem(null);
    try {
      recording.current = await startRecording();
      const now = Date.now();
      setClock({start: now, now});
      setState('recording');
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'micDenied' : 'micUnavailable');
    }
  }, []);

  // While recording: a countdown, and a stop at 15 seconds (the API takes no more).
  useEffect(() => {
    if (state !== 'recording') return;
    const tick = setInterval(() => setClock(current => ({...current, now: Date.now()})), 250);
    const limit = setTimeout(() => void stop(), MAX_SPEECH_SEC * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(limit);
    };
  }, [state, stop]);

  // Leaving the screen lets go of the microphone.
  useEffect(() => () => recording.current?.cancel(), []);

  const secondsLeft = Math.max(0, Math.ceil(MAX_SPEECH_SEC - (clock.now - clock.start) / 1000));
  return {state, problem, secondsLeft, start, stop};
}

/** The big mic button, with what it's doing underneath. Where recording can't work (plain http), just a note. */
function SpeechInput({disabled, onText}: {disabled: boolean; onText: (text: string) => void}) {
  const {t} = useI18n();
  const [supported] = useState(canRecord);
  const speech = useSpeech(onText);
  if (!supported) return <p className="hint mic-note">{t('micUnavailable')}</p>;
  const recording = speech.state === 'recording';
  const note = recording
    ? t('micListening', {n: speech.secondsLeft})
    : speech.state === 'working'
      ? t('micWorking')
      : t(speech.problem ?? 'micIdle');
  return (
    <div className="mic-area">
      <button
        type="button"
        className={`mic${recording ? ' mic-on' : ''}`}
        aria-label={t(recording ? 'micStop' : 'micStart')}
        disabled={disabled || speech.state === 'working'}
        onClick={() => void (recording ? speech.stop() : speech.start())}>
        <Icon name={recording ? 'stop' : 'mic'} size={40} />
      </button>
      <p className="mic-note" role="status">
        {note}
      </p>
    </div>
  );
}
