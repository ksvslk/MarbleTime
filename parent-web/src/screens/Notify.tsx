import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import type {PushState} from '../push/push';
import {useApi} from '../api/ApiContext';
import {usePush} from '../push/PushContext';
import {Switch} from '../ui/controls';
import {Icon} from '../ui/Icon';

const HINTS: Record<PushState, Key> = {
  off: 'notifyHint',
  on: 'notifyOnHint',
  'ios-home-screen': 'notifyIos',
  denied: 'notifyDenied',
  unsupported: 'notifyUnsupported',
};

/** "Get notified when a kid says I did it!": a switch, or what to do first when this phone can't yet. */
export function NotifyRow() {
  const {state, busy, setOn, untrusted} = usePush();
  const {t} = useI18n();
  const api = useApi();
  if (state === null) return null;
  return (
    <div className="setting-row">
      <span className="grow">
        <span className="row-title">{t('notifyTitle')}</span>
        <span className="hint">{t(untrusted ? 'notifyCert' : HINTS[state])}</span>
        {untrusted ? (
          <a className="text-link" href={api.certificateUrl} download>
            {t('notifyCertLink')}
          </a>
        ) : null}
      </span>
      {state === 'on' || state === 'off' ? <Switch checked={state === 'on'} label={t('notifyTitle')} disabled={busy} onChange={setOn} /> : null}
    </div>
  );
}

/** On Approvals until notifications are on, wherever this phone can still do something about it. */
export function NotifyCard() {
  const {state} = usePush();
  if (state === null || state === 'on' || state === 'unsupported') return null;
  return (
    <section className="card notify-card">
      <span className="notify-icon">
        <Icon name="bell" />
      </span>
      <NotifyRow />
    </section>
  );
}
