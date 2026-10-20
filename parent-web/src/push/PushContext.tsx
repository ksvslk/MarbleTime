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
  /** Turning on failed because this phone doesn't trust the address's certificate (a dev server on the Wi-Fi). */
  untrusted: boolean;
}

const PushContext = createContext<Push>({state: null, busy: false, setOn: () => undefined, untrusted: false});

/** This browser's notification state, shared by the Approvals card and Settings. */
export function PushProvider({children}: {children: ReactNode}) {
  const api = useApi();
  const {t} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [untrusted, setUntrusted] = useState(false);

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
          setUntrusted(false);
          if (next === 'on') toast(t('notifyOn'));
        }, error => {
          api.devLog(`notifications ${on ? 'on' : 'off'}`, error);
          // The browser shows the page but won't run the notification worker from an address whose certificate it
          // doesn't trust: say that, with the way out, instead of "try again".
          if (/certificate|SSL/i.test(String(error))) setUntrusted(true);
          else showError(error);
        })
        .finally(() => setBusy(false));
    },
    [api, t, toast, showError],
  );

  const value = useMemo(() => ({state, busy, setOn, untrusted}), [state, busy, setOn, untrusted]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export const usePush = () => useContext(PushContext);
