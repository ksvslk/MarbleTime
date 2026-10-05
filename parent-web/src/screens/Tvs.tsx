import {useEffect, useState, type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useApi} from '../api/ApiContext';
import type {Device, DeviceMode, Platform} from '../api/types';
import {useFamily} from '../family';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {timeAgo} from '../lib/format';
import {isPairCode, normalizeCode} from '../lib/validate';
import {Confirm} from '../ui/Confirm';
import {Chip, Field, Group} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Empty, Page} from '../ui/Page';
import {useShowError} from '../ui/Toast';

const PLATFORM_NAMES: Record<Platform, string> = {fireos: 'Fire TV', vega: 'Fire TV (Vega)', web: 'Web'};

const MODES: Record<DeviceMode, {label: Key; hint: Key}> = {
  amazon_kids: {label: 'modeAmazonKids', hint: 'modeHintAmazonKids'},
  strict: {label: 'modeStrict', hint: 'modeHintStrict'},
  api_mock: {label: 'modeApi', hint: 'modeHintApi'},
};

/** Strict mode needs the Kotlin module, which only the sideloaded Fire OS build has (docs/03 §3). */
const modesFor = (platform: Platform): DeviceMode[] => (platform === 'fireos' ? ['amazon_kids', 'strict', 'api_mock'] : ['amazon_kids', 'api_mock']);

/** Paired TVs (rename, mode, unpair) and how to pair another. */
export function Tvs() {
  const api = useApi();
  const {bundle, update} = useFamily();
  const {t} = useI18n();

  // "Last seen" moves all the time, so fetch the TVs fresh on every visit.
  useEffect(() => {
    api.devices().then(
      devices => update(b => ({...b, devices})),
      () => undefined,
    );
  }, [api, update]);

  return (
    <Page title={t('tabTvs')}>
      {bundle.devices.length === 0 ? (
        <Empty icon="tv" title={t('noTvs')} />
      ) : (
        <ul className="list">
          {bundle.devices.map(device => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </ul>
      )}
      <PairHelp />
    </Page>
  );
}

function DeviceCard({device}: {device: Device}) {
  const api = useApi();
  const {update} = useFamily();
  const {t, lang} = useI18n();
  const showError = useShowError();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const replace = (next: Device) => update(b => ({...b, devices: b.devices.map(d => (d.id === next.id ? next : d))}));

  const patch = async (body: {name?: string; mode?: DeviceMode}) => {
    setBusy(true);
    try {
      replace(await api.patchDevice(device.id, body));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && name.trim() !== device.name) void patch({name: name.trim()});
  };

  const unpair = async () => {
    setBusy(true);
    try {
      await api.removeDevice(device.id);
      update(b => ({...b, devices: b.devices.filter(d => d.id !== device.id)}));
    } catch (error) {
      showError(error);
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="card">
      <button type="button" className="row device-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="device-icon">
          <Icon name="tv" size={28} />
        </span>
        <span className="grow">
          <span className="row-title">{device.name}</span>
          <span className="meta">
            {PLATFORM_NAMES[device.platform]} · {t(MODES[device.mode].label)}
          </span>
          <span className="meta">{device.lastSeen ? t('seenAgo', {ago: timeAgo(lang, device.lastSeen, Date.now())}) : t('neverSeen')}</span>
        </span>
        <Icon name={open ? 'close' : 'pencil'} />
      </button>

      {open ? (
        <div className="form device-edit">
          <form className="inline-form" onSubmit={rename}>
            <Field label={t('tvName')} counter={`${name.length}/40`}>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
            </Field>
            <button className="btn btn-soft" disabled={busy || !name.trim() || name.trim() === device.name}>
              {t('save')}
            </button>
          </form>
          <Group label={t('mode')} hint={t(MODES[device.mode].hint)}>
            <div className="chips">
              {modesFor(device.platform).map(mode => (
                <Chip key={mode} selected={device.mode === mode} onClick={() => mode !== device.mode && void patch({mode})}>
                  {t(MODES[mode].label)}
                </Chip>
              ))}
            </div>
          </Group>
          <button type="button" className="btn btn-soft btn-block" onClick={() => setConfirming(true)}>
            <Icon name="close" />
            {t('unpair')}
          </button>
          <Confirm
            open={confirming}
            title={t('unpairQ', {tv: device.name})}
            text={t('unpairHint')}
            confirmLabel={t('unpair')}
            busy={busy}
            onConfirm={() => void unpair()}
            onCancel={() => setConfirming(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

/** How to pair: the TV shows a QR code of /pair/<code>; the code can also be typed in here. */
function PairHelp() {
  const {t} = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const clean = normalizeCode(code);

  const go = (event: FormEvent) => {
    event.preventDefault();
    if (isPairCode(clean)) navigate(`/pair/${clean}`);
  };

  return (
    <section className="card form pair-help">
      <h2 className="card-title">
        <Icon name="qr" />
        {t('pairTitle')}
      </h2>
      <ol className="steps-list">
        <li>{t('pairStep1')}</li>
        <li>{t('pairStep2')}</li>
      </ol>
      <form className="inline-form" onSubmit={go}>
        <Field label={t('typeCode')}>
          <input
            className="code-input"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="K7QX4M"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <button className="btn btn-gold" disabled={!isPairCode(clean)}>
          {t('go')}
        </button>
      </form>
    </section>
  );
}
