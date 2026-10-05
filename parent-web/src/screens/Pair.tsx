import {useState, type FormEvent} from 'react';
import {Link, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {isPairCode, normalizeCode} from '../lib/validate';
import {Field} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {useShowError} from '../ui/Toast';

type Step = 'name' | 'busy' | 'done' | 'expired' | 'unknown';

/**
 * /pair/:code, opened from the TV's QR code. Sign-in and onboarding come first (the gates in App.tsx keep the
 * address), then the grown-up names the TV and POST /pairings/{code}/confirm creates it.
 */
export function Pair() {
  const {code: raw = ''} = useParams();
  const code = normalizeCode(raw);
  const api = useApi();
  const {update} = useFamily();
  const {t} = useI18n();
  const showError = useShowError();
  const [name, setName] = useState(() => t('defaultTvName'));
  const [step, setStep] = useState<Step>(isPairCode(code) ? 'name' : 'unknown');

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setStep('busy');
    try {
      const device = await api.confirmPairing(code, {name: name.trim()});
      update(b => ({...b, devices: [...b.devices.filter(d => d.id !== device.id), device]}));
      setStep('done');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 410) setStep('expired');
      else if (status === 404) setStep('unknown');
      else {
        setStep('name');
        showError(error);
      }
    }
  };

  if (step === 'done') {
    return (
      <main className="center-screen">
        <span className="big-badge">
          <Icon name="check" size={56} />
        </span>
        <h1>{t('connected')}</h1>
        <p className="muted lead">{t('connectedHint')}</p>
        <Link className="btn btn-gold" to="/tvs" replace>
          {t('done')}
        </Link>
      </main>
    );
  }

  if (step === 'expired' || step === 'unknown') {
    return (
      <main className="center-screen">
        <span className="big-badge big-badge-glass">
          <Icon name="tv" size={52} />
        </span>
        <h1>{t(step === 'expired' ? 'codeExpired' : 'codeUnknown')}</h1>
        <p className="muted lead">{t('showNewCode')}</p>
        <p className="muted small">{t('pairStep1')}</p>
        <Link className="btn btn-glass" to="/tvs" replace>
          {t('back')}
        </Link>
      </main>
    );
  }

  return (
    <main className="center-screen">
      <span className="big-badge big-badge-glass">
        <Icon name="tv" size={52} />
      </span>
      <h1>{t('connectTitle')}</h1>
      <p className="muted">{t('codeLabel', {code})}</p>
      <form className="card form pair-form" onSubmit={confirm}>
        <Field label={t('tvName')} counter={`${name.length}/40`}>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
        </Field>
        <button className="btn btn-gold btn-block" disabled={step === 'busy' || !name.trim()}>
          {t('connect')}
        </button>
      </form>
    </main>
  );
}
