import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import type {Lang} from '../api/types';
import {detectLang, translate, type Key, type Vars} from './strings';

interface I18n {
  lang: Lang;
  /** The family's language once signed in; onboarding previews a choice with it. */
  setLang: (lang: Lang) => void;
  t: (key: Key, vars?: Vars) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({children}: {children: ReactNode}) {
  const [lang, setLang] = useState<Lang>(() => detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(() => ({lang, setLang, t: (key, vars) => translate(lang, key, vars)}), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Inside the signed-in app the family's language (stored on the server) wins from the very first render, so
 * text a screen computes once on mount (the default TV name) is in the right language too.
 */
export function FamilyLang({lang, children}: {lang: Lang; children: ReactNode}) {
  const {setLang} = useI18n();
  const value = useMemo<I18n>(() => ({lang, setLang, t: (key, vars) => translate(lang, key, vars)}), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
