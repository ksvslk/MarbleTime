import {useState, type FormEvent, type ReactNode} from 'react';
import {useApi} from '../api/ApiContext';
import type {FamilyPatch} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {pinProblem} from '../lib/validate';
import {Field, Group, Switch} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Page} from '../ui/Page';
import {useShowError, useToast} from '../ui/Toast';
import {LangChips, PinFields, TimeZoneSelect} from './FamilyFields';

/** Family name, language, time zone, the TV's text settings, the grown-ups PIN, and signing out. */
export function Settings() {
  const api = useApi();
  const {me, bundle, update} = useFamily();
  const {auth, label} = useAuth();
  const {t} = useI18n();
  const showError = useShowError();
  const family = bundle.family;
  const [name, setName] = useState(family.name);

  /** Shows the change at once and puts it back if the server says no. */
  const patch = async (body: Omit<FamilyPatch, 'pin'>) => {
    const before = family;
    update(b => ({...b, family: {...b.family, ...body}}));
    try {
      const saved = await api.patchFamily(body);
      update(b => ({...b, family: saved}));
    } catch (error) {
      update(b => ({...b, family: before}));
      showError(error);
    }
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && name.trim() !== family.name) void patch({name: name.trim()});
  };

  return (
    <Page title={t('tabSettings')}>
      <section className="card form">
        <h2 className="card-title">{t('family')}</h2>
        <form className="inline-form" onSubmit={saveName}>
          <Field label={t('familyName')} counter={`${name.length}/40`}>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={40} required autoComplete="family-name" />
          </Field>
          <button className="btn btn-soft" disabled={!name.trim() || name.trim() === family.name}>
            {t('save')}
          </button>
        </form>
        <Group label={t('language')}>
          <LangChips value={family.lang} onChange={lang => void patch({lang})} />
        </Group>
        <Field label={t('timeZone')}>
          <TimeZoneSelect value={family.timezone} onChange={timezone => void patch({timezone})} />
        </Field>
      </section>

      <section className="card form">
        <h2 className="card-title">
          <Icon name="tv" />
          {t('onTheTv')}
        </h2>
        <SettingRow title={t('capitals')} hint={t('capitalsHint')}>
          <Switch checked={family.caps} label={t('capitals')} onChange={caps => void patch({caps})} />
        </SettingRow>
        <SettingRow title={t('readAloud')} hint={t('readAloudHint')}>
          <Switch checked={family.voice} label={t('readAloud')} onChange={voice => void patch({voice})} />
        </SettingRow>
      </section>

      <PinCard />

      <section className="card form">
        <h2 className="card-title">{t('account')}</h2>
        <p className="muted-ink">{t('signedInAs', {who: me.parent.email || label})}</p>
        <button type="button" className="btn btn-soft btn-block" onClick={() => void auth.signOut(true)}>
          {t('signOut')}
        </button>
      </section>
    </Page>
  );
}

function SettingRow({title, hint, children}: {title: string; hint: string; children: ReactNode}) {
  return (
    <div className="setting-row">
      <span className="grow">
        <span className="row-title">{title}</span>
        <span className="hint">{hint}</span>
      </span>
      {children}
    </div>
  );
}

/** A new grown-ups PIN (the TV checks it offline; the server stores only a salted hash). */
function PinCard() {
  const api = useApi();
  const {update} = useFamily();
  const {t} = useI18n();
  const toast = useToast();
  const showError = useShowError();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState({pin: '', again: ''});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPin({pin: '', again: ''});
    setTried(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (pinProblem(pin.pin, pin.again)) return;
    setBusy(true);
    try {
      const saved = await api.patchFamily({pin: pin.pin});
      update(b => ({...b, family: saved}));
      toast(t('pinSaved'));
      close();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card form">
      <h2 className="card-title">
        <Icon name="lock" />
        {t('pin')}
      </h2>
      {open ? (
        <form className="form" onSubmit={save} noValidate>
          <PinFields label={t('newPin')} pin={pin.pin} again={pin.again} onChange={(next, again) => setPin({pin: next, again})} showErrors={tried} />
          <div className="button-row">
            <button className="btn btn-gold" disabled={busy}>
              {t('save')}
            </button>
            <button type="button" className="btn btn-soft" onClick={close}>
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-soft btn-block" onClick={() => setOpen(true)}>
          {t('changePin')}
        </button>
      )}
    </section>
  );
}
