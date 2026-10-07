import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {useApi} from '../api/ApiContext';
import {useI18n} from '../i18n/I18n';
import {useShowError, useToast} from '../ui/Toast';
import {currentPushState, turnPushOff, turnPushOn, type PushState} from './push';

interface Push {
  /** null while it's being checked. */
  state: PushState | null;
  busy: boolean;
  setOn: (on: boolean) => void;
}

const PushContext = createContext<Push>({state: null, busy: false, setOn: () => undefined});

/** This browser's notification state, shared by the Approvals card and Settings. */
export function PushProvider({children}: {children: ReactNode}) {
  const api = useApi();
  const {t} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    currentPushState(api)
      .catch((): PushState => 'off')
      .then(next => {
        if (alive) setState(next);
      });
    return () => {
      alive = false;
    };
  }, [api]);

  const setOn = useCallback(
    (on: boolean) => {
      setBusy(true);
      (on ? turnPushOn(api) : turnPushOff(api))
        .then(next => {
          setState(next);
          if (next === 'on') toast(t('notifyOn'));
        }, showError)
        .finally(() => setBusy(false));
    },
    [api, t, toast, showError],
  );

  const value = useMemo(() => ({state, busy, setOn}), [state, busy, setOn]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export const usePush = () => useContext(PushContext);
