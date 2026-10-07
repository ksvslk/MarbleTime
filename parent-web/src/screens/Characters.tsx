import {useCallback, useRef, useState} from 'react';
import {Link} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import type {Character, Child, Color} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {anyDrawing, svgDataUrl} from '../lib/characters';
import {usePolling} from '../lib/usePolling';
import {useLive, useOnChanged} from '../live/LiveContext';
import {Avatar} from '../ui/Avatar';
import {Confirm} from '../ui/Confirm';
import {Icon} from '../ui/Icon';
import {isOffline, useShowError} from '../ui/Toast';
import {CARD_COLORS} from '../tokens';

/** While a character is drawing and there's no live connection, look every few seconds (it takes about half a minute). */
const DRAWING_POLL_MS = 3000;
/** With a live connection the server says when it's ready; polling is only the backup. */
const LIVE_POLL_MS = 30000;
const IDLE_POLL_MS = 60000;

/**
 * A kid's characters (GET /children/{id}/characters), newest first: on load, whenever the family changed, and
 * often while one is drawing (or while `watching`, right after a new one was sent). When a drawing ends, the
 * family is fetched too: needs_help gives the kid's character token back. A server without the route yet (404)
 * counts as no characters.
 */
export function useCharacters(childId: string, watching = false) {
  const api = useApi();
  const {refresh} = useFamily();
  const {connected} = useLive();
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const drawingIds = useRef<string[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await api.characters(childId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return [];
        throw error;
      });
      if (drawingIds.current.some(id => list.find(character => character.id === id)?.status !== 'drawing')) void refresh();
      drawingIds.current = list.filter(character => character.status === 'drawing').map(character => character.id);
      setCharacters(list);
      setFailed(null);
    } catch (error) {
      setFailed(error);
    }
  }, [api, childId, refresh]);

  const busy = watching || (characters !== null && anyDrawing(characters));
  usePolling(load, busy ? (connected ? LIVE_POLL_MS : DRAWING_POLL_MS) : IDLE_POLL_MS);
  useOnChanged(() => void load());
  return {characters, failed, setCharacters};
}

/** Its name from the art director, else the kid's words. */
export function characterName(character: Character, fallback: string): string {
  return character.name?.trim() || (character.description ? `“${character.description}”` : fallback);
}

/**
 * The character on the kid's colour. Ready art is shown as an image (an <img> with a data: address): SVG shown
 * that way can't run scripts or load anything, and never becomes part of the page.
 */
export function CharacterArt({character, color, size}: {character: Character; color: Color; size: number}) {
  const {t} = useI18n();
  const ready = character.status === 'ready' && character.svg;
  return (
    <span className="character-art" style={{width: size, height: size, background: CARD_COLORS[color]}}>
      {ready ? (
        <img src={svgDataUrl(character.svg ?? '')} alt="" width={size} height={size} draggable={false} />
      ) : (
        <span
          className={character.status === 'drawing' ? 'character-drawing' : 'character-missing'}
          role="img"
          aria-label={t(character.status === 'drawing' ? 'drawingShort' : 'needsHelpShort')}>
          <Icon name="sparkle" size={Math.round(size * 0.36)} />
        </span>
      )}
    </span>
  );
}

/** "Make Mia's new character": shown wherever the kid is, as long as they have one to make. */
export function CharacterPrompt({child}: {child: Child}) {
  const {t} = useI18n();
  const tokens = child.characterTokens ?? 0;
  if (tokens <= 0) return null;
  return (
    <section className="card character-prompt">
      <div className="row">
        <span className="prompt-art">
          <Avatar avatar={child.avatar} color={child.color} size={60} />
          <span className="prompt-spark">
            <Icon name="sparkle" size={18} />
          </span>
        </span>
        <div className="grow">
          <h2 className="prompt-title">{t('makeCharacter', {kid: child.name})}</h2>
          <p className="hint">{tokens > 1 ? t('charactersToMake', {n: tokens}) : t('jarFullRule')}</p>
        </div>
      </div>
      <Link className="btn btn-gold btn-block" to={`/kids/${child.id}/character`}>
        <Icon name="sparkle" />
        {t('makeIt')}
      </Link>
    </section>
  );
}

/** The kid's characters, newest first, each with its name and a way to remove it (asked first). */
export function CharactersCard({child}: {child: Child}) {
  const api = useApi();
  const {t} = useI18n();
  const showError = useShowError();
  const {characters, failed, setCharacters} = useCharacters(child.id);
  const [removing, setRemoving] = useState<Character | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.removeCharacter(child.id, removing.id);
      setCharacters(list => list?.filter(character => character.id !== removing.id) ?? list);
      setRemoving(null);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="sparkle" />
        {t('characters')}
      </h2>
      {failed && !characters ? <p className="muted-ink">{t(isOffline(failed) ? 'errorOffline' : 'errorGeneric')}</p> : null}
      {characters?.length === 0 ? <p className="muted-ink">{t('noCharacters')}</p> : null}
      {characters?.length ? (
        <ul className="character-grid">
          {characters.map(character => (
            <li key={character.id} className="character-tile">
              <CharacterArt character={character} color={child.color} size={104} />
              <span className="character-name">{characterName(character, t('newCharacter'))}</span>
              {character.status === 'drawing' ? <span className="meta">{t('drawingShort')}</span> : null}
              {character.status === 'needs_help' ? (
                <>
                  <span className="meta">{t('needsHelpShort')}</span>
                  <Link className="text-link" to={`/kids/${child.id}/character`} state={{words: character.description}}>
                    {t('tryOtherWords')}
                  </Link>
                </>
              ) : null}
              <button
                type="button"
                className="btn-round btn-soft character-remove"
                aria-label={`${t('remove')}: ${characterName(character, t('newCharacter'))}`}
                onClick={() => setRemoving(character)}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Confirm
        open={removing !== null}
        title={t('removeCharacterQ', {name: removing ? characterName(removing, t('newCharacter')) : ''})}
        text={t(removing?.status === 'needs_help' ? 'removeFailedHint' : 'removeCharacterHint')}
        confirmLabel={t('remove')}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
