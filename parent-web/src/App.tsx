import {useCallback, useEffect, useMemo, useState} from 'react';
import {BrowserRouter, Navigate, Route, Routes, useMatch} from 'react-router';
import {ApiProvider, useApi} from './api/ApiContext';
import {ApiError} from './api/client';
import type {FamilyBundle, Me} from './api/types';
import {AuthProvider, useAuth} from './auth/AuthContext';
import {CALLBACK_PATH} from './auth/auth';
import type {ConfigResult} from './config';
import {FamilyContext, type FamilyState} from './family';
import {FamilyLang, useI18n} from './i18n/I18n';
import {Approvals} from './screens/Approvals';
import {JobEdit} from './screens/JobEdit';
import {Jobs} from './screens/Jobs';
import {KidDetail} from './screens/KidDetail';
import {KidEdit} from './screens/KidEdit';
import {Kids} from './screens/Kids';
import {Onboarding} from './screens/Onboarding';
import {Pair} from './screens/Pair';
import {Settings} from './screens/Settings';
import {AuthCallback, SignIn} from './screens/SignIn';
import {Tvs} from './screens/Tvs';
import {Art} from './ui/Icon';
import {Splash} from './ui/Page';
import {TabBar} from './ui/TabBar';
import {isOffline} from './ui/Toast';

/**
 * The gates, in order: config → signed in → family exists → the app. Each gate renders in place, so the
 * address (a TV's /pair/<code> link) survives sign-in and onboarding.
 */
export function App({config}: {config: ConfigResult}) {
  if (!config.ok) return <SetupNeeded missing={config.missing} />;
  return (
    <AuthProvider config={config.config}>
      <ApiProvider baseUrl={config.config.apiUrl}>
        <BrowserRouter>
          <Routes>
            <Route path={CALLBACK_PATH} element={<AuthCallback />} />
            <Route path="*" element={<SignedInGate />} />
          </Routes>
        </BrowserRouter>
      </ApiProvider>
    </AuthProvider>
  );
}

function SignedInGate() {
  const {status} = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <SignIn />;
  return <FamilyGate />;
}

/** Loads GET /me, then GET /family; no family yet means onboarding. */
function FamilyGate() {
  const api = useApi();
  const {setLang} = useI18n();
  const [data, setData] = useState<{me: Me; bundle: FamilyBundle | null} | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    const me = await api.me();
    const bundle = me.family ? await api.family() : null;
    setData({me, bundle});
    setError(null);
  }, [api]);
  const loadOrShow = useCallback(() => load().catch(setError), [load]);

  useEffect(() => void loadOrShow(), [loadOrShow]);
  // Keep the outer language in step too, so sign-in after a sign-out speaks the family's language.
  const familyLang = data?.bundle?.family.lang;
  useEffect(() => {
    if (familyLang) setLang(familyLang);
  }, [familyLang, setLang]);

  const update = useCallback(
    (change: (bundle: FamilyBundle) => FamilyBundle) => setData(current => (current?.bundle ? {...current, bundle: change(current.bundle)} : current)),
    [],
  );
  const refresh = useCallback(() => load().catch(() => undefined), [load]);
  const family = useMemo<FamilyState | null>(
    () => (data?.bundle ? {me: data.me, bundle: data.bundle, refresh, update} : null),
    [data, refresh, update],
  );

  if (!data) return error ? <LoadFailed error={error} onRetry={() => void loadOrShow()} /> : <Splash />;
  if (!family) return <Onboarding onDone={load} />;
  return (
    <FamilyContext.Provider value={family}>
      <FamilyLang lang={family.bundle.family.lang}>
        <Screens />
      </FamilyLang>
    </FamilyContext.Provider>
  );
}

function Screens() {
  const pairing = useMatch('/pair/:code');
  return (
    <div className={pairing ? 'app' : 'app app-with-tabs'}>
      <Routes>
        <Route index element={<Approvals />} />
        <Route path="kids" element={<Kids />} />
        <Route path="kids/new" element={<KidEdit />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="kids/:id/edit" element={<KidEdit />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/new" element={<JobEdit />} />
        <Route path="jobs/:id" element={<JobEdit />} />
        <Route path="tvs" element={<Tvs />} />
        <Route path="pair/:code" element={<Pair />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pairing ? null : <TabBar />}
    </div>
  );
}

function LoadFailed({error, onRetry}: {error: unknown; onRetry: () => void}) {
  const {auth} = useAuth();
  const {t} = useI18n();
  return (
    <main className="center-screen">
      <Art name="logo" size={72} />
      <p className="lead">{t(isOffline(error) ? 'errorOffline' : 'errorGeneric')}</p>
      {error instanceof ApiError && !isOffline(error) ? <p className="muted small">{`${error.status} ${error.code}`}</p> : null}
      <button className="btn btn-gold" onClick={onRetry}>
        {t('tryAgain')}
      </button>
      <button className="btn btn-glass" onClick={() => void auth.signOut(true)}>
        {t('signOut')}
      </button>
    </main>
  );
}

/** The build has no API address or sign-in settings (see README: .env files or /config.json). */
function SetupNeeded({missing}: {missing: string[]}) {
  const {t} = useI18n();
  return (
    <main className="center-screen">
      <Art name="logo" size={72} />
      <p className="lead">{t('setupNeeded')}</p>
      <p className="muted small">{t('setupMissing', {keys: missing.join(', ')})}</p>
    </main>
  );
}
