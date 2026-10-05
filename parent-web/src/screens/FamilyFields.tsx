import {langValues, type Lang} from '../api/types';
import {LANG_NAMES} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {pinProblem} from '../lib/validate';
import {Chip, Field} from '../ui/controls';

/** Default time zone for a new family: the phone's own. */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function LangChips({value, onChange}: {value: Lang; onChange: (lang: Lang) => void}) {
  return (
    <div className="chips">
      {langValues.map(lang => (
        <Chip key={lang} selected={value === lang} onClick={() => onChange(lang)}>
          {LANG_NAMES[lang]}
        </Chip>
      ))}
    </div>
  );
}

export function TimeZoneSelect({value, onChange}: {value: string; onChange: (zone: string) => void}) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const zones = all.includes(value) ? all : [value, ...all];
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {zones.map(zone => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}

/** The grown-ups PIN, typed twice. Errors show once the grown-up tried to save (`showErrors`). */
export function PinFields({pin, again, onChange, showErrors, label}: {
  pin: string;
  again: string;
  onChange: (pin: string, again: string) => void;
  showErrors: boolean;
  label: string;
}) {
  const {t} = useI18n();
  const digits = (text: string) => text.replace(/\D/g, '').slice(0, 4);
  const problem = pinProblem(pin, again);
  const formatError = showErrors && problem === 'pinFormat' ? t('pinFormat') : undefined;
  const mismatchError = (showErrors || again.length === 4) && problem === 'pinMismatch' ? t('pinMismatch') : undefined;
  const input = {type: 'password', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4, autoComplete: 'new-password', className: 'pin-input'} as const;
  return (
    <>
      <Field label={label} hint={t('pinHint')} error={formatError}>
        <input {...input} value={pin} onChange={e => onChange(digits(e.target.value), again)} required />
      </Field>
      <Field label={t('pinAgain')} error={mismatchError}>
        <input {...input} value={again} onChange={e => onChange(pin, digits(e.target.value))} required />
      </Field>
    </>
  );
}
