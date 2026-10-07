import type {ReactNode} from 'react';
import {useI18n} from '../i18n/I18n';
import {Icon} from './Icon';

/** A text input with its label (the input goes in `children`). */
export function Field({label, hint, error, counter, children}: {label: string; hint?: string; error?: string; counter?: string; children: ReactNode}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {counter ? <span className="field-counter">{counter}</span> : null}
      </span>
      {children}
      <FieldNote hint={hint} error={error} />
    </label>
  );
}

/**
 * A labelled group of buttons (chips, a stepper). A fieldset, not a <label>: a label would pass taps on its
 * text to the first button inside it.
 */
export function Group({label, hint, error, children}: {label: string; hint?: string; error?: string; children: ReactNode}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      {children}
      <FieldNote hint={hint} error={error} />
    </fieldset>
  );
}

function FieldNote({hint, error}: {hint?: string; error?: string}) {
  if (error) return <span className="field-error" role="alert">{error}</span>;
  return hint ? <span className="field-hint">{hint}</span> : null;
}

/** − value +, in steps. The value display goes in `children`. */
export function Stepper({value, min, max, step = 1, onChange, children}: {value: number; min: number; max: number; step?: number; onChange: (value: number) => void; children: ReactNode}) {
  const {t} = useI18n();
  return (
    <div className="stepper">
      <button type="button" className="btn-round btn-soft" aria-label={t('less')} disabled={value - step < min} onClick={() => onChange(value - step)}>
        <Icon name="minus" />
      </button>
      <output className="stepper-value">{children}</output>
      <button type="button" className="btn-round btn-soft" aria-label={t('more')} disabled={value + step > max} onClick={() => onChange(value + step)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

/** On/off. Selected states are shown by fill; the white ring only ever means focus (docs/03 §12). */
export function Switch({checked, label, disabled, onChange}: {checked: boolean; label: string; disabled?: boolean; onChange: (checked: boolean) => void}) {
  const {t} = useI18n();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? ' switch-on' : ''}`}
      onClick={() => onChange(!checked)}>
      <span>{checked ? t('on') : t('off')}</span>
      <span className="switch-knob" />
    </button>
  );
}

/** "✓ Saved", shown for a moment after an autosave (useAutosave). */
export function SavedNote() {
  const {t} = useI18n();
  return (
    <span className="saved" role="status">
      <Icon name="check" size={18} />
      {t('saved')}
    </span>
  );
}

export function Chip({selected, onClick, label, children}: {selected: boolean; onClick: () => void; label?: string; children: ReactNode}) {
  return (
    <button type="button" className={`chip${selected ? ' chip-on' : ''}`} aria-pressed={selected} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
