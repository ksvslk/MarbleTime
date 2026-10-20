import {useState} from 'react';
import {avatarValues, colorValues, type Avatar as AvatarName, type Child, type Color} from '../api/types';
import {useI18n} from '../i18n/I18n';
import {budgetForAge, budgetOf, defaultBudget, type Budget} from '../lib/budget';
import {Avatar} from '../ui/Avatar';
import {ColorPicker} from '../ui/ColorPicker';
import {Chip, Field, Group, Stepper, Switch} from '../ui/controls';
import {BudgetFields} from './Budget';

/** Stars for a character (the backend's PUZZLE_STARS; a saved kid carries the number in `puzzles.starsNeeded`). */
const PUZZLE_STARS = 5;
/** The ages each puzzle level is written for, level 1 first (the backend's LEVELS; a saved kid carries them in `puzzles.levelAges`). */
const LEVEL_AGES = ['4–5', '6', '7–8', '9–10'];

/** What a grown-up fills in for a kid (onboarding and the kid form): who they are, and their daily budget. */
export interface KidDraft extends Budget {
  name: string;
  avatar: AvatarName;
  color: Color;
  age: number;
  /** Puzzles on the TV for this kid (a star for every finished round toward a new character; never TV time). */
  puzzles: boolean;
  /** The puzzles' difficulty for every subject, chosen by the grown-up (1 easiest); 0: it follows the kid's answers. */
  puzzleLevel: number;
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
    puzzles: true,
    puzzleLevel: 0,
    ...defaultBudget(age),
  };
}

export function kidDraftFrom(child: Child): KidDraft {
  return {name: child.name, avatar: child.avatar, color: child.color, age: child.age, puzzles: child.puzzles.on, puzzleLevel: child.puzzles.level, ...budgetOf(child)};
}

/**
 * `onChange` takes an update function (a state setter fits), so quick taps never undo each other.
 * `amazonKids`: the family's TVs use Amazon Kids mode, so the daily base also belongs in Amazon Kids.
 * `isNew`: until the grown-up touches the budget, it follows the age's defaults (60 minutes under 7, 90 from 7).
 * `levelAges`: who each puzzle level is written for, as the backend says it for a saved kid.
 */
export function KidFields({value, amazonKids, isNew, levelAges = LEVEL_AGES, onChange}: {
  value: KidDraft;
  amazonKids: boolean;
  isNew: boolean;
  levelAges?: string[];
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
      <PuzzleFields value={value} levelAges={levelAges} onChange={set} />
    </>
  );
}

/** A kid's puzzle settings, as the kid form and the kid's page show them: on or off, and how hard. */
export type PuzzleSettings = Pick<KidDraft, 'puzzles' | 'puzzleLevel'>;

export function PuzzleFields({value, levelAges = LEVEL_AGES, starsNeeded = PUZZLE_STARS, onChange}: {
  value: PuzzleSettings;
  levelAges?: string[];
  starsNeeded?: number;
  onChange: (patch: Partial<PuzzleSettings>) => void;
}) {
  const {t} = useI18n();
  return (
    <>
      <div className="setting-row">
        <span className="grow">
          <span className="row-title">{t('puzzlesSetting')}</span>
          <span className="hint">{t('puzzlesHint', {max: starsNeeded})}</span>
        </span>
        <Switch checked={value.puzzles} label={t('puzzlesSetting')} onChange={puzzles => onChange({puzzles})} />
      </div>
      {/* How hard: by itself (the kid's answers move each subject), or the level the grown-up picks for every subject. */}
      {value.puzzles ? (
        <Group label={t('puzzleLevelTitle')} hint={t(value.puzzleLevel ? 'puzzleLevelChosenHint' : 'puzzleLevelAutoHint')}>
          <div className="chips">
            <Chip selected={value.puzzleLevel === 0} onClick={() => onChange({puzzleLevel: 0})}>
              {t('puzzleLevelAuto')}
            </Chip>
            {levelAges.map((ages, i) => (
              <Chip key={ages} selected={value.puzzleLevel === i + 1} onClick={() => onChange({puzzleLevel: i + 1})}>
                {t('puzzleLevelChip', {n: i + 1, ages})}
              </Chip>
            ))}
          </div>
        </Group>
      ) : null}
    </>
  );
}
