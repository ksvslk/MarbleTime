import {useEffect, useState, type FormEvent} from 'react';
import {Link, useLocation, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import type {Child} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {follow, IDEA_MAX, sendIdea, type Flow} from '../lib/characters';
import {Avatar} from '../ui/Avatar';
import {Field} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Empty, NotFound, Page} from '../ui/Page';
import {useShowError} from '../ui/Toast';
import {CharacterArt, useCharacters} from './Characters';

/**
 * /kids/:id/character: the kid says what their new character should be and a grown-up types it here (or the kid
 * types it on the TV; no voice since Oct 19),
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

/** Who it's for, the words, and "Draw it". After a 422, the sentence to read to the kid. */
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
