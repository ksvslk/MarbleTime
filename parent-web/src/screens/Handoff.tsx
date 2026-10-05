import {useCallback, useState} from 'react';
import {useApi} from '../api/ApiContext';
import type {Child, Handoff} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {formatMinutes} from '../lib/format';
import {AMAZON_PARENT_DASHBOARD, chunks, HANDOFF_BATCH} from '../lib/handoff';
import {Avatar} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {TimeLabel} from '../ui/Marbles';
import {useShowError, useToast} from '../ui/Toast';

/** Each kid's pending Amazon Kids hand-off (GET /children/{id}/handoff), refreshed on demand. */
export function useHandoffs(childIds: string[]) {
  const api = useApi();
  const [byChild, setByChild] = useState<Record<string, Handoff>>({});
  const idsKey = childIds.join(',');

  const refresh = useCallback(
    async (only?: string[]) => {
      const ids = only ?? idsKey.split(',').filter(Boolean);
      const results = await Promise.allSettled(ids.map(id => api.handoff(id)));
      setByChild(current => {
        const next = {...current};
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') next[ids[i]] = result.value;
        });
        return next;
      });
    },
    [api, idsKey],
  );
  const set = useCallback((childId: string, handoff: Handoff) => setByChild(current => ({...current, [childId]: handoff})), []);
  return {byChild, refresh, set};
}

/**
 * "Add 15 min in Amazon Kids": opens Amazon's Parent Dashboard in a new tab, where the grown-up adds bonus
 * time by hand (there's no API yet, docs/07); then "I added it" marks those ledger entries DONE.
 */
export function HandoffCard({child, handoff, title, onChange}: {
  child: Child;
  handoff: Handoff;
  /** Shown instead of the kid's animal and name (on the kid's own page). */
  title?: string;
  onChange: (handoff: Handoff) => void;
}) {
  const api = useApi();
  const {t, lang} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const minutes = formatMinutes(lang, handoff.pendingMinutes);

  const markAdded = async () => {
    setBusy(true);
    try {
      // Only the entries shown here: anything approved since stays pending for the next hand-off.
      let latest = handoff;
      for (const entryIds of chunks(handoff.entries.map(entry => entry.id), HANDOFF_BATCH)) {
        latest = await api.markHandoff(child.id, {entryIds, status: 'DONE'});
      }
      onChange(latest);
      setOpened(false);
      toast(t('handoffDone'));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card handoff">
      <div className="row">
        {title ? null : <Avatar avatar={child.avatar} color={child.color} size={44} />}
        <div className="grow">
          <p className="row-title">{title ?? child.name}</p>
          <TimeLabel minutes={handoff.pendingMinutes} />
        </div>
      </div>
      {opened ? (
        <>
          <p className="ask">{t('handoffAsk')}</p>
          <div className="button-row">
            <button type="button" className="btn btn-gold" disabled={busy} onClick={markAdded}>
              <Icon name="check" />
              {t('handoffAdded')}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setOpened(false)}>
              {t('notYet')}
            </button>
          </div>
        </>
      ) : (
        <>
          <a className="btn btn-gold btn-block" href={AMAZON_PARENT_DASHBOARD} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
            {t('handoffAdd', {min: minutes})}
            <Icon name="external" size={20} />
          </a>
          <p className="hint">{t('handoffHint')}</p>
        </>
      )}
    </div>
  );
}
