import {useI18n} from '../i18n/I18n';
import {dailyBaseText, marblesFor} from '../lib/format';
import {AMAZON_PARENT_DASHBOARD} from '../lib/handoff';
import {DAILY_BASE} from '../lib/time';
import {Stepper} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Marbles} from '../ui/Marbles';
import {MIN_PER_MARBLE} from '../tokens';

/**
 * The daily base: TV time every day, before anything is earned, so TV isn't only a prize.
 * A stepper in 5-minute steps, shown as marbles and "30 min every day".
 */
export function DailyBaseStepper({value, onChange}: {value: number; onChange: (minutes: number) => void}) {
  const {lang} = useI18n();
  return (
    <Stepper value={value} min={DAILY_BASE.min} max={DAILY_BASE.max} step={MIN_PER_MARBLE} onChange={onChange}>
      <Marbles count={marblesFor(value)} max={6} />
      <span className="time-text">{dailyBaseText(lang, value)}</span>
    </Stepper>
  );
}

/**
 * What the base is. In Amazon Kids mode the base isn't handed off: the grown-up sets the same daily limit
 * in Amazon Kids, so say so and link there.
 */
export function DailyBaseHint({amazonKids}: {amazonKids: boolean}) {
  const {t} = useI18n();
  return (
    <>
      <span className="field-hint">{t('dailyBaseHint')}</span>
      {amazonKids ? (
        <span className="field-hint">
          {t('dailyBaseAmazon')}{' '}
          <a className="text-link" href={AMAZON_PARENT_DASHBOARD} target="_blank" rel="noopener noreferrer">
            {t('openAmazonKids')}
            <Icon name="external" size={14} />
          </a>
        </span>
      ) : null}
    </>
  );
}
