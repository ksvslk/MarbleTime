import {Key, Lang, Localized, t} from './i18n';
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
  /** TV time every day before anything is earned, so TV isn't only a prize (a parent setting). */
  dailyBaseMin: number;
}

/** A real-life job, written by a parent (any length, any language; screens must fit it). */
export interface Job {
  id: string;
  title: string | Localized;
  icon: JobIconName;
  color: string;
  minutes: number;
  /** A one-off job: gone once approved (others come back the next day). */
  once?: boolean;
}

export type Topic = 'numbers' | 'words' | 'puzzles';
export type Shape = 'circle' | 'triangle' | 'square';

/** A brain game: a topic the parent allowed; its questions come from AI (M4) or the built-in bank. */
export interface Game {
  id: string;
  topic: Topic;
  title: Key;
  label: string;
  color: string;
  marbles: number;
}

export type Picture =
  | {kind: 'count'; item: 'apple'; n: number}
  | {kind: 'sequence'; shapes: Shape[]}
  | {kind: 'sentence'; before: string; after: string};

export type Choice = {kind: 'text'; text: string} | {kind: 'shape'; shape: Shape};

/** One question in the fixed template (docs/03 §11). */
export interface Question {
  prompt: string;
  say: string;
  picture: Picture;
  choices: Choice[];
  answer: number;
  praise: string;
}

/** The family: kids, their jobs and allowed games. Comes from the parent app (M2); a sample until then. */
export interface Family {
  kids: Kid[];
  jobs: Record<KidId, Job[]>;
  games: Record<KidId, Game[]>;
}

export const textOf = (value: string | Localized, lang: Lang) => (typeof value === 'string' ? value : value[lang]);

const KIDS: Kid[] = [
  {id: 'mia', name: 'Mia', avatar: 'bear', avatarBg: colors.gold, age: 5, dailyBaseMin: 30},
  {id: 'leo', name: 'Leo', avatar: 'bunny', avatarBg: colors.sky, age: 8, dailyBaseMin: 30},
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
    {id: 'cat', title: CAT, icon: 'cat', color: colors.mint, minutes: 10},
    {id: 'teeth', title: TEETH, icon: 'tooth', color: colors.sky, minutes: 5},
    {id: 'pajamas', title: PAJAMAS, icon: 'moon', color: colors.lilac, minutes: 10},
  ],
  leo: [
    {id: 'table', title: TABLE, icon: 'table', color: colors.peach, minutes: 15},
    {id: 'teeth', title: TEETH, icon: 'tooth', color: colors.sky, minutes: 5},
    {id: 'pajamas', title: PAJAMAS, icon: 'moon', color: colors.lilac, minutes: 10},
  ],
};

const GAMES: Record<KidId, Game[]> = {
  mia: [
    {id: 'numbers', topic: 'numbers', title: 'gameNumbers', label: '123', color: colors.sky, marbles: 2},
    {id: 'puzzles', topic: 'puzzles', title: 'gamePuzzles', label: '', color: colors.peach, marbles: 2},
  ],
  leo: [
    {id: 'words', topic: 'words', title: 'gameWords', label: 'Abc', color: colors.lilac, marbles: 2},
    {id: 'numbers', topic: 'numbers', title: 'gameNumbers', label: '123', color: colors.sky, marbles: 2},
  ],
};

export const SAMPLE_FAMILY: Family = {kids: KIDS, jobs: JOBS, games: GAMES};

/** Worst-case user content for layout checks (marbletime://open?stress=1): long names, long jobs, 3 kids, 4 languages. */
export const STRESS_FAMILY: Family = {
  kids: [
    {id: 'max', name: 'Maximilian-Alexander', avatar: 'bear', avatarBg: colors.gold, age: 5, dailyBaseMin: 30},
    {id: 'onnela', name: 'Õnnela-Mai Kristiina', avatar: 'bunny', avatarBg: colors.sky, age: 8, dailyBaseMin: 30},
    {id: 'jo', name: 'Jo', avatar: 'bear', avatarBg: colors.mint, age: 6, dailyBaseMin: 0},
  ],
  jobs: {
    max: [
      {id: 'dish', title: 'Geschirrspülmaschine ausräumen und Küche wischen', icon: 'table', color: colors.peach, minutes: 15},
      {id: 'lego', title: 'Put all the LEGO back in the big blue box under the bed', icon: 'toys', color: colors.mint, minutes: 10},
      {id: 'et', title: 'Tühjenda nõudepesumasin ja pühi köögilaud puhtaks', icon: 'table', color: colors.sky, minutes: 10},
      {id: 'es', title: 'Recoger los juguetes del salón antes de cenar', icon: 'toys', color: colors.lilac, minutes: 5},
      {id: 'x', title: 'X', icon: 'star', color: colors.peach, minutes: 5},
    ],
    onnela: [
      {id: 'long', title: 'Supercalifragilisticexpialidocious', icon: 'star', color: colors.lilac, minutes: 20},
      {id: 'dish', title: 'Geschirrspülmaschine ausräumen und Küche wischen', icon: 'table', color: colors.peach, minutes: 15},
    ],
    jo: [{id: 'bed', title: 'Bed', icon: 'bed', color: colors.sky, minutes: 5}],
  },
  games: {max: GAMES.mia, onnela: GAMES.leo, jo: GAMES.mia},
};

/** Most marbles a kid can earn from games per day, so real-life jobs stay the main way to earn. */
export const DAILY_GAME_MARBLES = 4;

export const DEMO_PIN = '1234';

const text = (word: string): Choice => ({kind: 'text', text: word});
const shape = (sh: Shape): Choice => ({kind: 'shape', shape: sh});

const apples = (lang: Lang, n: number, choices: number[]): Question => ({
  prompt: t(lang, 'howManyApples'),
  say: t(lang, 'howManyApplesSay'),
  picture: {kind: 'count', item: 'apple', n},
  choices: choices.map(c => text(String(c))),
  answer: choices.indexOf(n),
  praise: t(lang, 'applesPraise', {n}),
});

const next = (lang: Lang, shapes: Shape[], answer: Shape, choices: Shape[]): Question => ({
  prompt: t(lang, 'whatNext'),
  say: t(lang, 'whatNext'),
  picture: {kind: 'sequence', shapes},
  choices: choices.map(shape),
  answer: choices.indexOf(answer),
  praise: t(lang, 'foundIt'),
});

const fill = (lang: Lang, before: string, after: string, choices: string[], answer: string): Question => ({
  prompt: t(lang, 'whichWord'),
  say: `${t(lang, 'whichWord')} ${before} … ${after}`,
  picture: {kind: 'sentence', before, after},
  choices: choices.map(text),
  answer: choices.indexOf(answer),
  praise: `${before} ${answer} ${after}`.trim(),
});

const sum = (lang: Lang, a: number, b: number, choices: number[]): Question => ({
  prompt: t(lang, 'howMuch'),
  say: t(lang, 'sumSay', {a, b}),
  picture: {kind: 'sentence', before: `${a} + ${b} =`, after: ''},
  choices: choices.map(c => text(String(c))),
  answer: choices.indexOf(a + b),
  praise: `${a} + ${b} = ${a + b}`,
});

/** Grammar is different in every language, so the word puzzles are written per language (AI makes more in M4). */
const GRAMMAR: Record<Lang, [string, string, string[], string][]> = {
  en: [
    ['Every day, the dog', 'to the park.', ['run', 'runs', 'running'], 'runs'],
    ['Yesterday we', 'a big cake.', ['bake', 'baked', 'baking'], 'baked'],
    ['The birds are', 'in the tree.', ['sing', 'sings', 'singing'], 'singing'],
  ],
  et: [
    ['Koer', 'iga päev parki.', ['jooksma', 'jookseb', 'jooksis'], 'jookseb'],
    ['Eile me', 'suure koogi.', ['küpsetame', 'küpsetasime', 'küpsetama'], 'küpsetasime'],
    ['Linnud', 'puu otsas.', ['laulab', 'laulma', 'laulavad'], 'laulavad'],
  ],
  de: [
    ['Jeden Tag', 'der Hund in den Park.', ['laufen', 'läuft', 'laufend'], 'läuft'],
    ['Gestern', 'wir einen großen Kuchen.', ['backen', 'backten', 'gebacken'], 'backten'],
    ['Die Vögel', 'im Baum.', ['singt', 'singen', 'gesungen'], 'singen'],
  ],
  es: [
    ['Todos los días, el perro', 'al parque.', ['correr', 'corre', 'corriendo'], 'corre'],
    ['Ayer', 'un pastel grande.', ['hacemos', 'hicimos', 'hacer'], 'hicimos'],
    ['Los pájaros', 'en el árbol.', ['canta', 'cantan', 'cantar'], 'cantan'],
  ],
};

/** Built-in question bank: works offline and before the AI generator exists (M4). */
export function bank(lang: Lang): Record<Topic, Record<'young' | 'old', Question[]>> {
  return {
    numbers: {
      young: [apples(lang, 4, [3, 4, 5]), apples(lang, 3, [2, 3, 4]), apples(lang, 5, [5, 6, 4]), apples(lang, 2, [1, 3, 2])],
      old: [sum(lang, 7, 5, [11, 12, 13]), sum(lang, 9, 6, [15, 14, 16]), sum(lang, 8, 8, [18, 16, 17])],
    },
    puzzles: {
      young: [
        next(lang, ['circle', 'triangle', 'circle', 'triangle', 'circle'], 'triangle', ['square', 'triangle', 'circle']),
        next(lang, ['square', 'square', 'circle', 'square', 'square'], 'circle', ['circle', 'triangle', 'square']),
        next(lang, ['triangle', 'circle', 'square', 'triangle', 'circle'], 'square', ['triangle', 'square', 'circle']),
      ],
      old: [next(lang, ['circle', 'circle', 'triangle', 'circle', 'circle'], 'triangle', ['circle', 'square', 'triangle'])],
    },
    words: {
      young: [],
      old: GRAMMAR[lang].map(([before, after, choices, answer]) => fill(lang, before, after, choices, answer)),
    },
  };
}

/** The app checks every question itself (docs/03 §11); AI-made sets go through the same check in M4. */
export function isQuestionValid(q: Question): boolean {
  if (q.choices.length !== 3 || q.answer < 0 || q.answer > 2) return false;
  const keys = q.choices.map(c => (c.kind === 'text' ? c.text : c.shape));
  if (new Set(keys).size !== 3) return false;
  const right = q.choices[q.answer];
  if (q.picture.kind === 'count') return right.kind === 'text' && Number(right.text) === q.picture.n;
  if (q.picture.kind === 'sequence') {
    const seq = q.picture.shapes;
    // Repeating pattern: find the shortest period that explains the sequence, then predict the next shape.
    for (let period = 1; period < seq.length; period++) {
      if (seq.every((sh, i) => sh === seq[i % period])) {
        return right.kind === 'shape' && right.shape === seq[seq.length % period];
      }
    }
    return false;
  }
  if (q.picture.kind === 'sentence' && /^\d+ \+ \d+ =$/.test(q.picture.before)) {
    const [a, b] = q.picture.before.match(/\d+/g)!.map(Number);
    return right.kind === 'text' && Number(right.text) === a + b;
  }
  return true; // grammar: checked against the word list in M4
}

export function questionsFor(topic: Topic, age: number, lang: Lang = 'en', count = 3): Question[] {
  const band = age <= 6 ? 'young' : 'old';
  const all = bank(lang)[topic];
  const pool = all[band].length ? all[band] : all[band === 'young' ? 'old' : 'young'];
  return pool.filter(isQuestionValid).slice(0, count);
}
