import {useEffect, useState, type FormEvent} from 'react';
import {useLocation, useNavigate} from 'react-router';
import {useAuth} from '../auth/AuthContext';
import {useI18n} from '../i18n/I18n';
import {Field} from '../ui/controls';
import {Art} from '../ui/Icon';
import {Splash} from '../ui/Page';

/**
 * Sign in, then come back to the same page (a TV's /pair/<code> link included).
 * Cognito: one button to managed login. Dev mode: just a name, sent as `Bearer dev-<name>`.
 */
export function SignIn() {
  const {auth} = useAuth();
  const {t, lang} = useI18n();
  const location = useLocation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pairing = location.pathname.startsWith('/pair/');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await auth.signIn({returnTo: location.pathname + location.search, lang, name});
      // Cognito leaves the page from here; dev mode re-renders as signed in.
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <main className="center-screen">
      <Art name="logo" size={96} />
      <h1 className="brand">MarbleTime</h1>
      <p className="muted lead">{pairing ? t('signInToPair') : t('tagline')}</p>
      <form className="sign-in" onSubmit={submit}>
        {auth.kind === 'dev' ? (
          <Field label={t('yourName')} hint={t('devMode')}>
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={40} autoComplete="given-name" />
          </Field>
        ) : null}
        <button className="btn btn-gold btn-block" disabled={busy}>
          {t('signIn')}
        </button>
        {auth.kind === 'cognito' ? <p className="muted small">{t('signInHint')}</p> : null}
        {failed ? (
          <p className="error-text" role="alert">
            {t('signInFailed')}
          </p>
        ) : null}
      </form>
    </main>
  );
}

/** /auth/callback: Cognito sends the grown-up back here with a code; swap it for tokens, then carry on. */
export function AuthCallback() {
  const {auth} = useAuth();
  const {t, lang} = useI18n();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    auth.finishSignIn().then(
      to => navigate(to, {replace: true}),
      () => setFailed(true),
    );
  }, [auth, navigate]);

  if (!failed) return <Splash />;
  return (
    <main className="center-screen">
      <Art name="logo" size={72} />
      <p className="lead">{t('signInFailed')}</p>
      <button className="btn btn-gold" onClick={() => void auth.signIn({returnTo: '/', lang})}>
        {t('tryAgain')}
      </button>
    </main>
  );
}
