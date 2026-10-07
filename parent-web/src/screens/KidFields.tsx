import {useState} from 'react';
import {avatarValues, colorValues, type Avatar as AvatarName, type Child, type Color} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {budgetForAge, budgetOf, defaultBudget, type Budget} from '../lib/budget';
import {Avatar} from '../ui/Avatar';
import {ColorPicker} from '../ui/ColorPicker';
import {Field, Group, Stepper} from '../ui/controls';
import {BudgetFields} from './Budget';

/** What a grown-up fills in for a kid (onboarding and the kid form): who they are, and their daily budget. */
export interface KidDraft extends Budget {
  name: string;
  avatar: AvatarName;
  color: Color;
  age: number;
}

/** A new kid gets a colour no other kid has yet, so the kids are easy to tell apart on the TV. */
export function newKidDraft(kids: Child[]): KidDraft {
  const taken = kids.map(kid => kid.color);
  const age = 6;
  return {
    name: '',
    avatar: kids.length % 2 ? 'bunny' : 'bear',
    color: colorValues.find(c => !taken.includes(c)) ?? 'peach',
    age,
    ...defaultBudget(age),
  };
}

export function kidDraftFrom(child: Child): KidDraft {
  return {name: child.name, avatar: child.avatar, color: child.color, age: child.age, ...budgetOf(child)};
}

/**
 * `onChange` takes an update function (a state setter fits), so quick taps never undo each other.
 * `amazonKids`: the family's TVs use Amazon Kids mode, so the daily base also belongs in Amazon Kids.
 * `isNew`: until the grown-up touches the budget, it follows the age's defaults (60 minutes under 7, 90 from 7).
 */
export function KidFields({value, amazonKids, isNew, onChange}: {
  value: KidDraft;
  amazonKids: boolean;
  isNew: boolean;
  onChange: (update: (current: KidDraft) => KidDraft) => void;
}) {
  const {t} = useI18n();
  const [budgetTouched, setBudgetTouched] = useState(false);
  const set = (patch: Partial<KidDraft>) => onChange(current => ({...current, ...patch}));
  const setAge = (age: number) => onChange(current => ({...current, age, ...budgetForAge(age, current, isNew && !budgetTouched)}));
  const setBudget = (update: (current: Budget) => Budget) => {
    setBudgetTouched(true);
    onChange(current => ({...current, ...update(current)}));
  };
  return (
    <>
      <Field label={t('name')} counter={`${value.name.length}/24`}>
        <input value={value.name} onChange={e => set({name: e.target.value})} required maxLength={24} autoComplete="off" />
      </Field>
      <Group label={t('animal')}>
        <div className="pick-row">
          {avatarValues.map(avatar => (
            <button
              key={avatar}
              type="button"
              className={`pick${value.avatar === avatar ? ' pick-on' : ''}`}
              aria-pressed={value.avatar === avatar}
              onClick={() => set({avatar})}>
              <Avatar avatar={avatar} color={value.color} size={64} />
              <span>{t(avatar)}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label={t('colour')}>
        <ColorPicker value={value.color} onChange={color => set({color})} />
      </Group>
      <Group label={t('age')} hint={t('ageHint')}>
        <Stepper value={value.age} min={3} max={12} onChange={setAge}>
          <span className="stepper-number">{value.age}</span>
        </Stepper>
      </Group>
      <section className="sub-form">
        <h3 className="sub-title">{t('budgetTitle')}</h3>
        <BudgetFields age={value.age} value={value} amazonKids={amazonKids} onChange={setBudget} />
      </section>
    </>
  );
}
