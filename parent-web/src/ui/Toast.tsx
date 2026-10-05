import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {ApiError} from '../api/client';
import {useI18n} from '../i18n/I18n';

const ToastContext = createContext<(text: string) => void>(() => {});

/** One short message at a time above the tab bar, read out by screen readers. */
export function ToastProvider({children}: {children: ReactNode}) {
  const [toast, setToast] = useState<{id: number; text: string} | null>(null);
  const show = useCallback((text: string) => setToast({id: Date.now(), text}), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast ? (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Tells the grown-up a call failed: "check the connection" when offline, a plain "try again" otherwise. */
export function useShowError() {
  const toast = useToast();
  const {t} = useI18n();
  return useCallback((error: unknown) => toast(t(isOffline(error) ? 'errorOffline' : 'errorGeneric')), [toast, t]);
}

export const isOffline = (error: unknown) => error instanceof ApiError && error.status === 0;
