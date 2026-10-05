import {avatarValues, colorValues, topicValues, type Avatar as AvatarName, type Child, type Color, type GameSettings} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {DAILY_BASE} from '../lib/time';
import {Avatar} from '../ui/Avatar';
import {ColorPicker} from '../ui/ColorPicker';
import {Field, Group, Stepper} from '../ui/controls';
import {DailyBaseHint, DailyBaseStepper} from './DailyBase';

/** What a grown-up fills in for a kid (onboarding and the kid form). */
export interface KidDraft {
  name: string;
  avatar: AvatarName;
  color: Color;
  age: number;
  dailyBaseMin: number;
}

/** A new kid gets a colour no other kid has yet, so the kids are easy to tell apart on the TV. */
export function newKidDraft(kids: Child[]): KidDraft {
  const taken = kids.map(kid => kid.color);
  return {
    name: '',
    avatar: kids.length % 2 ? 'bunny' : 'bear',
    color: colorValues.find(c => !taken.includes(c)) ?? 'peach',
    age: 6,
    dailyBaseMin: DAILY_BASE.default,
  };
}

/** Brain games a new kid starts with: every topic, 4 marbles a day (docs/03 §11). */
export const DEFAULT_GAMES: GameSettings = {topics: [...topicValues], dailyCapMarbles: 4};

/**
 * `onChange` takes an update function (a state setter fits), so quick taps never undo each other.
 * `amazonKids`: the family's TVs use Amazon Kids mode, so the daily base also belongs in Amazon Kids.
 */
export function KidFields({value, amazonKids, onChange}: {
  value: KidDraft;
  amazonKids: boolean;
  onChange: (update: (current: KidDraft) => KidDraft) => void;
}) {
  const {t} = useI18n();
  const set = (patch: Partial<KidDraft>) => onChange(current => ({...current, ...patch}));
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
        <Stepper value={value.age} min={3} max={12} onChange={age => set({age})}>
          <span className="stepper-number">{value.age}</span>
        </Stepper>
      </Group>
      <Group label={t('everyDay')}>
        <DailyBaseStepper value={value.dailyBaseMin} onChange={dailyBaseMin => set({dailyBaseMin})} />
        <DailyBaseHint amazonKids={amazonKids} />
      </Group>
    </>
  );
}
