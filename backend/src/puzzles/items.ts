/**
 * Puzzles (docs/08 §3–§5, "Decisions (Oct 12)"): short questions a kid answers on the TV, in one fixed shape: a
 * question that is read aloud, an optional row of pictures, three answers. They are written by a model (writer.ts),
 * never by the TV, and kept as a bank per language (bank/<lang>.json), so playing never waits on a model and works
 * where no model is reachable. Every item in a bank passed the code checks here and the blind solvers in writer.ts,
 * and says where it came from.
 *
 * What a subject is and what a level means are data (SUBJECTS, LEVELS): a new subject is one more entry, and the
 * bank, the picking, the TV and the parent app take it as it comes.
 */
import type {Lang} from '../domain/types';

export interface PuzzleChoice {
  /** A word, a short phrase or a number… */
  text?: string;
  /** …or one picture. All three answers of an item are the same kind. */
  emoji?: string;
}

export interface PuzzleItem {
  /** Stable: a hash of the language and the question (writer.ts itemId). */
  id: string;
  lang: Lang;
  subject: SubjectId;
  /** 1–4 (LEVELS). */
  level: number;
  /** The question, as it is shown and read aloud. */
  prompt: string;
  /** Pictures the question is about, shown in a row (none for a question that needs no picture). */
  picture: string[];
  choices: PuzzleChoice[];
  /** The place of the right answer, 0–2. */
  answer: number;
  /** One short line shown and read after the kid answers: why the right answer is right. */
  reason: string;
  /** Where it came from, for the audit and the credits. */
  source: {by: 'ai'; model: string; solvers: string; at: string};
}

/** What a level asks of a kid; a kid starts one level below their age's (docs/08 §3.7), then their answers place them. */
export const LEVELS = [
  {level: 1, ages: '4–5', can: 'cannot read; counts to 5; knows common animals, foods, colours and everyday things'},
  {level: 2, ages: '6', can: 'is starting to read short words; counts to 10; adds and takes away within 5; knows days, seasons, simple opposites'},
  {level: 3, ages: '7–8', can: 'reads short sentences; adds and takes away within 20; knows simple facts about nature, time and money'},
  {level: 4, ages: '9–10', can: 'reads well; multiplies small numbers; can reason through a short riddle with two clues'},
] as const;
export const MAX_LEVEL = LEVELS.length;

/** The level a kid of this age starts at: one below the level for the age, at least 1. */
export const startLevel = (age: number) => Math.max(1, (age <= 5 ? 1 : age === 6 ? 2 : age <= 8 ? 3 : 4) - 1);

export const SUBJECTS = {
  logic: 'thinking puzzles: which one does not belong, what comes next in a pattern, a short riddle ("I have four legs and I bark. What am I?"), bigger or smaller, what goes together',
  numbers: 'numbers in everyday life: counting pictured things, more or fewer, small story sums ("Mia has two apples and gets one more"), what number comes next',
  words: 'words and language: opposites, which word fits the picture, which things belong to a group ("Which one is a fruit?"), the first sound or letter of a pictured word, rhymes where the language has easy ones',
  world: 'the world around us: animals and what they do, nature and seasons, the body, everyday safety and habits, time of day, simple how-things-work',
} as const;
export type SubjectId = keyof typeof SUBJECTS;
export const SUBJECT_IDS = Object.keys(SUBJECTS) as SubjectId[];

/**
 * The pictures a puzzle may use: emoji every Fire TV shows (Android 11, Emoji 13), each a single character that is
 * a picture by default (no variation selectors or joined sequences, so comparing them is plain string equality).
 */
export const EMOJI = [...new Set(Array.from(
  '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦉🐴🦄🐝🐛🦋🐌🐞🐜🐢🐍🐙🐠🐟🐬🐳🦈🐊🐘🦒🐪🐑🐐🦌🐕🐈🐓🦔🐇🐄🐖🐎' +
  '🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🥝🍅🥕🌽🥔🥦🥒🍞🧀🥚🍕🍔🍟🍰🎂🍪🍫🍬🍭🍦🥛🍯🥜🥞🍲🥣' +
  '🌳🌲🌴🌵🌷🌹🌻🌼🍀🍁🍂🍄🌙⭐🌞🌈⛄🔥💧🌊⚡🌍' +
  '🚗🚕🚌🚒🚑🚓🚜🚲🛴🚀🚁🚂⛵🚢🚚' +
  '⚽🏀🎈🎁🎨🎸🥁🎺🎻📚📖🔑🔔⏰🔦💡🧸🧩🎲👕👖👗👟🧦🧤🧢👑🎩🌂🏠🏰⛺🚪🧼🛁🔨🧹🧺🥄🍴🥤📱💻📺🪑🪥🪁' +
  '🔴🔵🟢🟡🟠🟣⚫⚪🟥🟦🟩🟨🔺⬛⬜💛💙💚🧡💜' +
  '😀😢😴😡😮👶👧👦👩👨👵👴✋👣👀👂👃👄🦷',
))];
const ALLOWED = new Set(EMOJI);

const chars = (text: string) => [...text].length;
const key = (choice: PuzzleChoice) => (choice.emoji ?? choice.text ?? '').trim().toLocaleLowerCase();

/** What a writer's answer must hold before anything else looks at it. */
export type PuzzleDraft = Pick<PuzzleItem, 'prompt' | 'picture' | 'choices' | 'answer' | 'reason'>;

/**
 * The code checks: the shape a kid's screen can show and a voice can read. They say nothing about whether the
 * answer is right (that is the blind solvers' job); they stop what would break the screen or isn't a fair choice.
 * Returns the problems found, none for a sound item.
 */
export function problemsOf(item: PuzzleDraft): string[] {
  const problems: string[] = [];
  const prompt = item.prompt?.trim() ?? '';
  if (chars(prompt) < 6 || chars(prompt) > 110) problems.push('the question must be 6–110 characters');
  if (/[\n\r]|https?:|www\./.test(prompt)) problems.push('the question must be one plain line');
  if (!Array.isArray(item.picture) || item.picture.length > 10) problems.push('at most 10 pictures');
  else if (item.picture.some(e => !ALLOWED.has(e))) problems.push(`a picture is not in the allowed set: ${item.picture.filter(e => !ALLOWED.has(e)).join(' ')}`);
  if (!Array.isArray(item.choices) || item.choices.length !== 3) return [...problems, 'exactly three answers'];
  const kinds = item.choices.map(c => (c.emoji ? 'emoji' : c.text?.trim() ? 'text' : 'empty'));
  if (kinds.includes('empty')) problems.push('an answer is empty');
  if (new Set(kinds).size > 1) problems.push('the three answers must be all words or all pictures');
  if (item.choices.some(c => c.emoji && c.text?.trim())) problems.push('an answer is a word or a picture, not both');
  if (item.choices.some(c => c.emoji && !ALLOWED.has(c.emoji))) problems.push('an answer picture is not in the allowed set');
  if (item.choices.some(c => c.text && chars(c.text.trim()) > 22)) problems.push('an answer is longer than 22 characters');
  if (new Set(item.choices.map(key)).size !== 3) problems.push('the three answers must differ');
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 2) problems.push('the right answer must be place 0, 1 or 2');
  const reason = item.reason?.trim() ?? '';
  if (chars(reason) < 3 || chars(reason) > 110) problems.push('the reason must be 3–110 characters');
  return problems;
}
