import {useState, type FormEvent} from 'react';
import {useApi} from '../api/ApiContext';
import {ApiError} from '../api/client';
import {useI18n} from '../i18n/I18n';
import {pinProblem} from '../lib/validate';
import {Field, Group} from '../ui/controls';
import {Art} from '../ui/Icon';
import {useShowError} from '../ui/Toast';
import {browserTimeZone, LangChips, PinFields, TimeZoneSelect} from './FamilyFields';
import {DEFAULT_GAMES, KidFields, newKidDraft, type KidDraft} from './KidFields';

/** First visit (GET /me says family: null): the family, then the first kid. */
export function Onboarding({onDone}: {onDone: () => Promise<void>}) {
  const api = useApi();
  const {t, lang, setLang} = useI18n();
  const showError = useShowError();
  const [step, setStep] = useState<'family' | 'kid'>('family');
  const [family, setFamily] = useState({name: '', timezone: browserTimeZone(), pin: '', pinAgain: ''});
  const [kid, setKid] = useState<KidDraft>(() => newKidDraft([]));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set once the kid is stored: if loading the app afterwards fails, trying again mustn't add them twice.
  const [kidSaved, setKidSaved] = useState(false);

  const saveFamily = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!family.name.trim() || pinProblem(family.pin, family.pinAgain)) return;
    setBusy(true);
    try {
      await api.createFamily({name: family.name.trim(), lang, timezone: family.timezone, pin: family.pin});
      setStep('kid');
    } catch (error) {
      // 409: this grown-up already has a family (a double tap, or a second try): carry on with the kid.
      if (error instanceof ApiError && error.status === 409) setStep('kid');
      else showError(error);
    } finally {
      setBusy(false);
    }
  };

  const saveKid = async (event: FormEvent) => {
    event.preventDefault();
    if (!kid.name.trim()) return;
    setBusy(true);
    try {
      if (!kidSaved) {
        await api.addChild({...kid, name: kid.name.trim(), games: DEFAULT_GAMES});
        setKidSaved(true);
      }
      await onDone();
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  };

  return (
    <main className="page onboarding">
      <header className="onboarding-head">
        <Art name="logo" size={44} />
        <span className="brand-small">MarbleTime</span>
      </header>
      <div className="steps" aria-hidden="true">
        <span className={step === 'family' ? 'step-on' : ''} />
        <span className={step === 'kid' ? 'step-on' : ''} />
      </div>

      {step === 'family' ? (
        <form className="card form" onSubmit={saveFamily} noValidate>
          <h1>{t('welcome')}</h1>
          <p className="hint">{t('welcomeHint')}</p>
          <Field label={t('familyName')} counter={`${family.name.length}/40`}>
            <input
              value={family.name}
              onChange={e => {
                const name = e.target.value;
                setFamily(current => ({...current, name}));
              }}
              placeholder={t('familyNamePlaceholder')}
              maxLength={40}
              required
              autoComplete="family-name"
            />
          </Field>
          <Group label={t('language')}>
            <LangChips value={lang} onChange={setLang} />
          </Group>
          <Field label={t('timeZone')}>
            <TimeZoneSelect value={family.timezone} onChange={timezone => setFamily(current => ({...current, timezone}))} />
          </Field>
          <PinFields
            label={t('pin')}
            pin={family.pin}
            again={family.pinAgain}
            onChange={(pin, pinAgain) => setFamily(current => ({...current, pin, pinAgain}))}
            showErrors={tried}
          />
          <button className="btn btn-gold btn-block" disabled={busy || !family.name.trim()}>
            {t('next')}
          </button>
        </form>
      ) : (
        <form className="card form" onSubmit={saveKid}>
          <h1>{t('firstKid')}</h1>
          <p className="hint">{t('firstKidHint')}</p>
          <KidFields value={kid} onChange={setKid} />
          <button className="btn btn-gold btn-block" disabled={busy || !kid.name.trim()}>
            {t('start')}
          </button>
        </form>
      )}
    </main>
  );
}
