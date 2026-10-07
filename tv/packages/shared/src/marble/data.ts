import {Lang, Localized} from './i18n';
import {colors} from './tokens';

/** Kids, names and jobs are user content (parents type them), so ids are plain strings. */
export type KidId = string;

/**
 * Job icons, each with a few words that say when it fits. When a parent adds a job, the AI picks the icon
 * from this list by the title, in any language (M2); the parent can change it. Drawn by scripts/make-icons.py.
 */
export const JOB_ICONS = [
  {name: 'toys', hint: 'tidy up toys, put things away'},
  {name: 'cat', hint: 'cat, feed or brush the cat, pets'},
  {name: 'tooth', hint: 'brush teeth'},
  {name: 'moon', hint: 'bedtime, pajamas, go to sleep'},
  {name: 'broom', hint: 'sweep, clean the floor, tidy a room'},
  {name: 'bed', hint: 'make the bed'},
  {name: 'shirt', hint: 'get dressed, put clothes away, fold clothes'},
  {name: 'laundry', hint: 'laundry, washing machine, sort socks'},
  {name: 'trash', hint: 'take out the trash, empty the bin'},
  {name: 'recycle', hint: 'recycling, sort bottles and paper'},
  {name: 'table', hint: 'set or clear the table, dishes, dishwasher, eat dinner'},
  {name: 'cook', hint: 'help cook, bake, make breakfast'},
  {name: 'wash', hint: 'wash hands, wash something'},
  {name: 'shower', hint: 'take a shower, wash hair'},
  {name: 'bath', hint: 'take a bath'},
  {name: 'dog', hint: 'dog, walk or feed the dog'},
  {name: 'fish', hint: 'feed the fish, aquarium'},
  {name: 'bird', hint: 'bird, feed the birds'},
  {name: 'rabbit', hint: 'rabbit, hamster, guinea pig, small pets'},
  {name: 'plant', hint: 'water the plants, garden'},
  {name: 'leaf', hint: 'rake leaves, outdoor work, nature'},
  {name: 'snow', hint: 'shovel snow, winter clothes'},
  {name: 'book', hint: 'read a book, reading'},
  {name: 'pencil', hint: 'homework, writing, practise letters'},
  {name: 'backpack', hint: 'pack the school bag, get ready for school'},
  {name: 'music', hint: 'practise an instrument, sing, music lesson'},
  {name: 'paint', hint: 'draw, paint, art'},
  {name: 'puzzle', hint: 'puzzle, board game, play quietly'},
  {name: 'bike', hint: 'ride a bike, sport, exercise'},
  {name: 'shoes', hint: 'put shoes away, go for a walk'},
  {name: 'car', hint: 'wash the car, get in the car'},
  {name: 'shopping', hint: 'help with shopping, unpack the shopping'},
  {name: 'spray', hint: 'clean windows or the bathroom, wipe'},
  {name: 'sofa', hint: 'tidy the living room, cushions'},
  {name: 'lamp', hint: 'turn off the lights, save energy'},
  {name: 'baby', hint: 'help with a baby or a younger sibling'},
  {name: 'heart', hint: 'be kind, help someone, say thank you'},
  {name: 'water', hint: 'drink water'},
  {name: 'fruit', hint: 'eat fruit, healthy snack'},
  {name: 'veggie', hint: 'eat vegetables'},
  {name: 'sun', hint: 'play outside, fresh air, sunscreen'},
  {name: 'mail', hint: 'get the mail, write a card or letter'},
  {name: 'star', hint: 'anything else'},
] as const;

export type JobIconName = (typeof JOB_ICONS)[number]['name'];
export type IconName =
  | JobIconName
  | 'hourglass' | 'thumbs' | 'play' | 'speaker' | 'check' | 'lock' | 'lockopen' | 'undo' | 'clock' | 'shapes' | 'message' | 'sparkle' | 'home' | 'games';

export interface Kid {
  id: KidId;
  name: string;
  avatar: 'bear' | 'bunny';
  avatarBg: string;
  age: number;
  /** TV time every day before anything is earned: an allowance, so TV isn't only a prize (a parent setting). */
  dailyBaseMin: number;
  /** The most TV a day, everything included: the jar's size (docs/08 §1: 60 under 7, 90 from 7 by default). */
  dailyMaxMin: number;
  /** New characters earned (jobs approved while the jar was full) and not yet made. */
  characterTokens?: number;
}

/** A real-life job, written by a parent (any length, any language; screens must fit it). */
export interface Job {
  id: string;
  title: string | Localized;
  icon: JobIconName;
  color: string;
  /** 10, 20 or 30: one to three marbles. */
  minutes: number;
  /** A one-off job: gone once approved (others come back the next day). */
  once?: boolean;
  /** A job the kid already does regularly: praised, no marble (docs/08 §2.4). */
  routine?: boolean;
}

/** The family: kids and their jobs. Comes from the parent app; empty until a phone pairs the TV. */
export interface Family {
  kids: Kid[];
  jobs: Record<KidId, Job[]>;
}

export const textOf = (value: string | Localized, lang: Lang) => (typeof value === 'string' ? value : value[lang]);

const KIDS: Kid[] = [
  {id: 'mia', name: 'Mia', avatar: 'bear', avatarBg: colors.gold, age: 5, dailyBaseMin: 30, dailyMaxMin: 60},
  {id: 'leo', name: 'Leo', avatar: 'bunny', avatarBg: colors.sky, age: 8, dailyBaseMin: 40, dailyMaxMin: 90},
];

// Sample jobs. Real ones are written by parents in the parent app, in their own language.
const TOYS: Localized = {en: 'Toys away', et: 'Korista mänguasjad', de: 'Spielzeug aufräumen', es: 'Recoger juguetes'};
const CAT: Localized = {en: 'Feed the cat', et: 'Toida kassi', de: 'Katze füttern', es: 'Alimentar al gato'};
const TEETH: Localized = {en: 'Brush teeth', et: 'Pese hambaid', de: 'Zähne putzen', es: 'Lavarse los dientes'};
const PAJAMAS: Localized = {en: 'Pajamas on', et: 'Pidžaama selga', de: 'Schlafanzug an', es: 'Ponerse el pijama'};
const TABLE: Localized = {en: 'Set the table', et: 'Kata laud', de: 'Tisch decken', es: 'Poner la mesa'};

const JOBS: Record<KidId, Job[]> = {
  mia: [
    {id: 'toys', title: TOYS, icon: 'toys', color: colors.peach, minutes: 10},
    {id: 'cat', title: CAT, icon: 'cat', color: colors.mint, minutes: 20},
    {id: 'teeth', title: TEETH, icon: 'tooth', color: colors.sky, minutes: 10, routine: true},
    {id: 'pajamas', title: PAJAMAS, icon: 'moon', color: colors.lilac, minutes: 10},
  ],
  leo: [
    {id: 'table', title: TABLE, icon: 'table', color: colors.peach, minutes: 20},
    {id: 'teeth', title: TEETH, icon: 'tooth', color: colors.sky, minutes: 10, routine: true},
    {id: 'pajamas', title: PAJAMAS, icon: 'moon', color: colors.lilac, minutes: 10},
  ],
};

/** A TV that isn't paired yet has no family at all (it shows the welcome screen). */
export const EMPTY_FAMILY: Family = {kids: [], jobs: {}};

/** Test and demo material only: unit tests, the layout-check test links and the demo voice clips. A real TV never shows it. */
export const SAMPLE_FAMILY: Family = {kids: KIDS, jobs: JOBS};

/** Worst-case user content for layout checks (marbletime://open?stress=1): long names, long jobs, 3 kids, 4 languages. */
export const STRESS_FAMILY: Family = {
  kids: [
    {id: 'max', name: 'Maximilian-Alexander', avatar: 'bear', avatarBg: colors.gold, age: 5, dailyBaseMin: 30, dailyMaxMin: 60},
    {id: 'onnela', name: 'Õnnela-Mai Kristiina', avatar: 'bunny', avatarBg: colors.sky, age: 8, dailyBaseMin: 60, dailyMaxMin: 120},
    {id: 'jo', name: 'Jo', avatar: 'bear', avatarBg: colors.mint, age: 6, dailyBaseMin: 0, dailyMaxMin: 60},
  ],
  jobs: {
    max: [
      {id: 'dish', title: 'Geschirrspülmaschine ausräumen und Küche wischen', icon: 'table', color: colors.peach, minutes: 30},
      {id: 'lego', title: 'Put all the LEGO back in the big blue box under the bed', icon: 'toys', color: colors.mint, minutes: 20},
      {id: 'et', title: 'Tühjenda nõudepesumasin ja pühi köögilaud puhtaks', icon: 'table', color: colors.sky, minutes: 20},
      {id: 'es', title: 'Recoger los juguetes del salón antes de cenar', icon: 'toys', color: colors.lilac, minutes: 10},
      {id: 'x', title: 'X', icon: 'star', color: colors.peach, minutes: 10, routine: true},
    ],
    onnela: [
      {id: 'long', title: 'Supercalifragilisticexpialidocious', icon: 'star', color: colors.lilac, minutes: 30},
      {id: 'dish', title: 'Geschirrspülmaschine ausräumen und Küche wischen', icon: 'table', color: colors.peach, minutes: 20},
    ],
    jo: [{id: 'bed', title: 'Bed', icon: 'bed', color: colors.sky, minutes: 10}],
  },
};

/** The grown-ups PIN while a test link's sample family is loaded (a real TV uses the family's own PIN). */
export const DEMO_PIN = '1234';
