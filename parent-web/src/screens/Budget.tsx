import {useI18n} from '../i18n/I18n';
import {CEILING_MIN, ceilingLimit, clampBudget, GUIDANCE_AGE, jarParts, type Budget} from '../lib/budget';
import {formatMinutes, marblesFor} from '../lib/format';
import {AMAZON_PARENT_DASHBOARD} from '../lib/handoff';
import {Group, Stepper} from '../ui/controls';
import {Icon} from '../ui/Icon';
import {Marble} from '../ui/Marbles';
import {MIN_PER_MARBLE} from '../tokens';

/**
 * The jar, plainly: a place for every marble the day can hold, the free ones already in (gold: they are time),
 * the ones jobs can add left empty; then the sum, "30 min free + 30 min from jobs = 60 min a day".
 */
export function JarView({budget}: {budget: Budget}) {
  const {t, lang} = useI18n();
  const {base, earnable, max} = jarParts(budget);
  const minutes = (n: number) => formatMinutes(lang, n);
  return (
    <div className="jar" role="img" aria-label={t('jarSum', {base: minutes(base), earn: minutes(earnable), max: minutes(max)})}>
      <div className="jar-row">
        {Array.from({length: marblesFor(base)}, (_, i) => (
          <Marble key={`free-${i}`} size={20} />
        ))}
        {Array.from({length: marblesFor(earnable)}, (_, i) => (
          <span key={`earn-${i}`} className="jar-slot" />
        ))}
      </div>
      <div className="jar-sum">
        <span className="jar-part">
          <strong>{minutes(base)}</strong>
          <span>
            <Marble size={12} /> {t('jarFree')}
          </span>
        </span>
        <span className="jar-op">+</span>
        <span className="jar-part">
          <strong>{minutes(earnable)}</strong>
          <span>
            <span className="jar-slot jar-slot-small" /> {t('jarFromJobs')}
          </span>
        </span>
        <span className="jar-op">=</span>
        <span className="jar-part">
          <strong>{minutes(max)}</strong>
          <span>{t('jarADay')}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The daily budget: the most TV a day (by age, from health guidance) and the free base inside it. `onChange`
 * takes an update function (a state setter fits), so quick taps never undo each other; every change is made
 * to fit the age (whole marbles, the base never above the ceiling).
 */
export function BudgetFields({age, value, amazonKids, onChange}: {
  age: number;
  value: Budget;
  amazonKids: boolean;
  onChange: (update: (current: Budget) => Budget) => void;
}) {
  const {t, lang} = useI18n();
  const set = (patch: Partial<Budget>) => onChange(current => clampBudget(age, {...current, ...patch}));
  return (
    <>
      <JarView budget={value} />
      <Group label={t('dailyMax')} hint={t(age < GUIDANCE_AGE ? 'dailyMaxYoung' : 'dailyMaxOlder')}>
        <Stepper value={value.dailyMaxMin} min={CEILING_MIN} max={ceilingLimit(age)} step={MIN_PER_MARBLE} onChange={dailyMaxMin => set({dailyMaxMin})}>
          <span className="stepper-minutes">{formatMinutes(lang, value.dailyMaxMin)}</span>
        </Stepper>
      </Group>
      <Group label={t('dailyBase')}>
        <Stepper value={value.dailyBaseMin} min={0} max={value.dailyMaxMin} step={MIN_PER_MARBLE} onChange={dailyBaseMin => set({dailyBaseMin})}>
          <span className="stepper-minutes">{formatMinutes(lang, value.dailyBaseMin)}</span>
        </Stepper>
        <DailyBaseHint amazonKids={amazonKids} />
      </Group>
      <p className="hint jar-rule">
        <Icon name="sparkle" size={16} />
        {t('jarFullRule')}
      </p>
    </>
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
