import {colors} from './tokens';

export type KidId = 'mia' | 'leo';
export type IconName =
  | 'toys' | 'cat' | 'tooth' | 'moon' | 'hourglass' | 'thumbs' | 'play' | 'speaker' | 'check'
  | 'lock' | 'lockopen' | 'undo' | 'broom' | 'clock' | 'shapes' | 'message' | 'sparkle';

export interface Kid {
  id: KidId;
  name: string;
  avatar: 'bear' | 'bunny';
  avatarBg: string;
  age: number;
}

/** A real-life job, written by a parent. */
export interface Job {
  id: string;
  title: string;
  icon: IconName;
  color: string;
  minutes: number;
}

export type Topic = 'numbers' | 'words' | 'puzzles';
export type Shape = 'circle' | 'triangle' | 'square';

/** A brain game: a topic the parent allowed; its questions come from AI (M4) or the built-in bank. */
export interface Game {
  id: string;
  topic: Topic;
  title: string;
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

export const KIDS: Kid[] = [
  {id: 'mia', name: 'Mia', avatar: 'bear', avatarBg: colors.gold, age: 5},
  {id: 'leo', name: 'Leo', avatar: 'bunny', avatarBg: colors.sky, age: 8},
];

export const JOBS: Record<KidId, Job[]> = {
  mia: [
    {id: 'toys', title: 'Toys away', icon: 'toys', color: colors.peach, minutes: 10},
    {id: 'cat', title: 'Feed the cat', icon: 'cat', color: colors.mint, minutes: 10},
    {id: 'teeth', title: 'Brush teeth', icon: 'tooth', color: colors.sky, minutes: 5},
    {id: 'pajamas', title: 'Pajamas on', icon: 'moon', color: colors.lilac, minutes: 10},
  ],
  leo: [
    {id: 'table', title: 'Set the table', icon: 'toys', color: colors.peach, minutes: 15},
    {id: 'teeth', title: 'Brush teeth', icon: 'tooth', color: colors.sky, minutes: 5},
    {id: 'pajamas', title: 'Pajamas on', icon: 'moon', color: colors.lilac, minutes: 10},
  ],
};

export const GAMES: Record<KidId, Game[]> = {
  mia: [
    {id: 'numbers', topic: 'numbers', title: 'Numbers', label: '123', color: colors.sky, marbles: 2},
    {id: 'puzzles', topic: 'puzzles', title: 'Puzzles', label: '', color: colors.peach, marbles: 2},
  ],
  leo: [
    {id: 'words', topic: 'words', title: 'Words', label: 'Abc', color: colors.lilac, marbles: 2},
    {id: 'numbers', topic: 'numbers', title: 'Numbers', label: '123', color: colors.sky, marbles: 2},
  ],
};

/** Most marbles a kid can earn from games per day, so real-life jobs stay the main way to earn. */
export const DAILY_GAME_MARBLES = 4;

export const DEMO_PIN = '1234';

const text = (t: string): Choice => ({kind: 'text', text: t});
const shape = (sh: Shape): Choice => ({kind: 'shape', shape: sh});

const apples = (n: number, choices: number[]): Question => ({
  prompt: 'How many apples?',
  say: 'How many apples can you count?',
  picture: {kind: 'count', item: 'apple', n},
  choices: choices.map(c => text(String(c))),
  answer: choices.indexOf(n),
  praise: `${n} apples!`,
});

const next = (shapes: Shape[], answer: Shape, choices: Shape[]): Question => ({
  prompt: 'What comes next?',
  say: 'What comes next?',
  picture: {kind: 'sequence', shapes},
  choices: choices.map(shape),
  answer: choices.indexOf(answer),
  praise: 'You found it!',
});

const fill = (before: string, after: string, choices: string[], answer: string): Question => ({
  prompt: 'Which word fits?',
  say: `${before} blank ${after}`,
  picture: {kind: 'sentence', before, after},
  choices: choices.map(text),
  answer: choices.indexOf(answer),
  praise: `${before} ${answer} ${after}`.trim(),
});

const sum = (a: number, b: number, choices: number[]): Question => ({
  prompt: 'How much is it?',
  say: `What is ${a} plus ${b}?`,
  picture: {kind: 'sentence', before: `${a} + ${b} =`, after: ''},
  choices: choices.map(c => text(String(c))),
  answer: choices.indexOf(a + b),
  praise: `${a} + ${b} = ${a + b}`,
});

/** Built-in question bank: works offline and before the AI generator exists (M4). */
export const BANK: Record<Topic, Record<'young' | 'old', Question[]>> = {
  numbers: {
    young: [apples(4, [3, 4, 5]), apples(3, [2, 3, 4]), apples(5, [5, 6, 4]), apples(2, [1, 3, 2])],
    old: [sum(7, 5, [11, 12, 13]), sum(9, 6, [15, 14, 16]), sum(8, 8, [18, 16, 17])],
  },
  puzzles: {
    young: [
      next(['circle', 'triangle', 'circle', 'triangle', 'circle'], 'triangle', ['square', 'triangle', 'circle']),
      next(['square', 'square', 'circle', 'square', 'square'], 'circle', ['circle', 'triangle', 'square']),
      next(['triangle', 'circle', 'square', 'triangle', 'circle'], 'square', ['triangle', 'square', 'circle']),
    ],
    old: [
      next(['circle', 'circle', 'triangle', 'circle', 'circle'], 'triangle', ['circle', 'square', 'triangle']),
    ],
  },
  words: {
    young: [],
    old: [
      fill('Every day, the dog', 'to the park.', ['run', 'runs', 'running'], 'runs'),
      fill('Yesterday we', 'a big cake.', ['bake', 'baked', 'baking'], 'baked'),
      fill('The birds are', 'in the tree.', ['sing', 'sings', 'singing'], 'singing'),
    ],
  },
};

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

export function questionsFor(topic: Topic, age: number, count = 3): Question[] {
  const band = age <= 6 ? 'young' : 'old';
  const pool = BANK[topic][band].length ? BANK[topic][band] : BANK[topic][band === 'young' ? 'old' : 'young'];
  return pool.filter(isQuestionValid).slice(0, count);
}
