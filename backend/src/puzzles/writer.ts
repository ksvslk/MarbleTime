/**
 * Writing puzzles with a model, and deciding which ones a kid may see (docs/08 §5).
 *
 * The writer's answer is only a claim. An item goes into a bank when
 *  1. it has the shape a screen can show (items.ts problemsOf), and
 *  2. blind solvers agree with it: each sees only what the kid sees (the question, the pictures, the three answers
 *     in a fresh order, never the writer's answer or reason), picks an answer and judges the question. Every solver
 *     must pick the writer's answer and find the question clear, unarguable, right for the age and well written in
 *     the language. One doubt and the item is dropped: nothing is repaired, because a model fixing its own item
 *     tends to make it worse (docs/08 §5).
 * Solvers of another model family catch more than the writer's own family (errors correlate); which ones ran is
 * kept on every item (`source.solvers`), and the audit sample is a person's job.
 */
import {createHash} from 'node:crypto';
import type {AiModel, JsonSchema} from '../ai/model';
import type {Lang} from '../domain/types';
import {EMOJI, LEVELS, problemsOf, type PuzzleChoice, type PuzzleDraft, type PuzzleItem, type SubjectId, SUBJECTS} from './items';

const LANGUAGE: Record<Lang, string> = {en: 'English', et: 'Estonian', de: 'German', es: 'Spanish'};

const DRAFTS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'picture', 'choices', 'answer', 'reason'],
        properties: {
          prompt: {type: 'string'},
          picture: {type: 'array', items: {type: 'string'}},
          choices: {
            type: 'array',
            items: {type: 'object', additionalProperties: false, required: ['text', 'emoji'], properties: {text: {type: 'string'}, emoji: {type: 'string'}}},
          },
          answer: {type: 'integer'},
          reason: {type: 'string'},
        },
      },
    },
  },
};

const SOLVE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pick', 'sure', 'arguable', 'ageOk', 'languageOk', 'note'],
  properties: {
    pick: {type: 'integer'},
    sure: {type: 'boolean'},
    arguable: {type: 'boolean'},
    ageOk: {type: 'boolean'},
    languageOk: {type: 'boolean'},
    note: {type: 'string'},
  },
};

export interface WriteAsk {
  lang: Lang;
  subject: SubjectId;
  level: number;
  count: number;
  /** Questions already in the bank for this subject and level, so the writer makes new ones. */
  have: string[];
  /**
   * How this kid did on their last questions in the subject, oldest first (a session written for one kid): the new
   * ones are pitched to that, a step on from what they got right and easier where they missed.
   */
  history?: {prompt: string; right: boolean}[];
}

function writerPrompt(ask: WriteAsk): {system: string; user: string} {
  const level = LEVELS[ask.level - 1];
  const language = LANGUAGE[ask.lang];
  const system = [
    `You write short quiz puzzles for children, shown on a TV and read aloud by a warm narrator. You write in ${language}, as a native children's author would: natural, correct, simple.`,
    'Each puzzle has: a question (one or two short sentences), an optional row of pictures (emoji) the question is about, exactly three answers, the place of the right answer (0, 1 or 2), and one short sentence that says why it is right.',
    'Rules:',
    '- The child hears the question, so it must make sense when read aloud. Small numbers in the question are written as words.',
    '- Exactly one answer is right, beyond argument. The two wrong answers are plausible for a child but clearly wrong to an adult. No trick questions, no "all of these".',
    '- The three answers are either all words (a word, a number or at most three words each) or all single emoji. For words leave "emoji" empty; for emoji leave "text" empty.',
    '- Pictures and emoji answers come only from this set, exactly as written here: ' + EMOJI.join(' '),
    '- A picture row shows what the question asks about (things to count, a pattern, an animal). Never put the answer in the question. If the question needs no picture, give none.',
    '- Do not ask about the colour or small details of an emoji: they look different on different screens. Asking which thing or how many is fine.',
    '- Vary the place of the right answer. Vary the kinds of puzzle within the subject. Make them playful, concrete and from a child\'s world.',
    '- Kind and safe for young children: nothing scary, no brands, no characters from films or games, no religion or politics, nothing that depends on one country\'s customs.',
    '- The reason is one friendly sentence a child understands, said as a fact ("A dog barks."). No praise words in it.',
  ].join('\n');
  const user = [
    `Write ${ask.count} puzzles in ${language}.`,
    `Subject: ${SUBJECTS[ask.subject]}.`,
    `For a child aged ${level.ages} who ${level.can}.${ask.history?.length ? '' : ' Not easier than that, not harder.'}`,
    ask.history?.length ? [
      'These are for one child. Here is how that child did on their last questions in this subject, oldest first:',
      ...ask.history.map(answer => `- ${answer.right ? 'right' : 'missed'}: ${answer.prompt}`),
      'Pitch the new ones to this child, so that about four in five come out right: a small step harder than the kind they got right, and easier, with a clearer picture or smaller numbers, for the kind they missed. If they got nearly all right, make them clearly harder; if they missed several, clearly easier. Stay with what a child of this age can understand when it is read aloud.',
    ].join('\n') : '',
    ask.have.length ? `These already exist; write different ones:\n${ask.have.slice(-40).map(q => `- ${q}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  return {system, user};
}

const clean = (choice: PuzzleChoice): PuzzleChoice => (choice.emoji?.trim() ? {emoji: bare(choice.emoji)} : {text: (choice.text ?? '').trim()});
/** Models often add the "show as a picture" mark to an emoji; the set has none. */
const bare = (emoji: string) => emoji.replace(/️/g, '').trim();

/** What the writer wrote, tidied (trimmed, emoji bare); not yet checked. */
export async function draft(writer: AiModel, ask: WriteAsk): Promise<PuzzleDraft[]> {
  const reply = await writer.json({...writerPrompt(ask), schema: DRAFTS_SCHEMA, name: 'puzzles', maxTokens: 8192});
  if (reply.stop !== 'done') throw new Error(`the writer stopped: ${reply.stop}`);
  const items = (reply.value as {items?: PuzzleDraft[]}).items ?? [];
  return items.map(item => ({
    prompt: String(item.prompt ?? '').trim(),
    picture: (Array.isArray(item.picture) ? item.picture : []).map(e => bare(String(e))).filter(Boolean),
    choices: (Array.isArray(item.choices) ? item.choices : []).map(clean),
    answer: item.answer,
    reason: String(item.reason ?? '').trim(),
  }));
}

/** A fresh order of the three answers for a solver: `order[i]` is the item's place shown at place i. */
const ORDERS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]];

export interface Verdict {
  ok: boolean;
  /** Why not, in the solver's words or ours. */
  why?: string;
}

/** One blind solve: the solver sees the question as the kid does, in the given order of answers. */
export async function solve(solver: AiModel, item: PuzzleDraft, lang: Lang, level: number, order: number[]): Promise<Verdict> {
  const shown = order.map(i => item.choices[i]);
  const reply = await solver.json({
    system: [
      `You check a quiz puzzle for a child, written in ${LANGUAGE[lang]}. You see exactly what the child sees. First solve it yourself, then judge it strictly.`,
      'Answer with: pick (the place of the answer you choose: 0, 1 or 2); sure (you are certain it is right); arguable (true if another answer could also be defended, or the question is unclear, or it depends on how a picture is drawn); ageOk (a child of the given age can understand and answer it, and it is kind and safe); languageOk (the text is correct, natural language a native speaker would use with a child, with no spelling or grammar mistakes); note (a few words on any problem, else empty).',
    ].join('\n'),
    user: [
      `Child's age: ${LEVELS[level - 1].ages}. The child ${LEVELS[level - 1].can}.`,
      `Question: ${item.prompt}`,
      item.picture.length ? `Pictures shown: ${item.picture.join(' ')}` : 'No pictures.',
      ...shown.map((choice, i) => `Answer ${i}: ${choice.emoji ?? choice.text}`),
    ].join('\n'),
    // Room for a model that thinks before it answers (its thinking counts toward the limit).
    schema: SOLVE_SCHEMA, name: 'verdict', maxTokens: 4096,
  });
  if (reply.stop !== 'done') return {ok: false, why: `a solver stopped: ${reply.stop}`};
  const v = reply.value as {pick: number; sure: boolean; arguable: boolean; ageOk: boolean; languageOk: boolean; note: string};
  if (order[v.pick] !== item.answer) return {ok: false, why: `a solver picked "${shown[v.pick]?.emoji ?? shown[v.pick]?.text}"${v.note ? `: ${v.note}` : ''}`};
  const doubt = !v.sure ? 'not sure' : v.arguable ? 'arguable' : !v.ageOk ? 'not right for the age' : !v.languageOk ? 'language' : '';
  return doubt ? {ok: false, why: `${doubt}${v.note ? `: ${v.note}` : ''}`} : {ok: true};
}

/** Items checked at the same time. */
const AT_ONCE = 3;

export const itemId = (lang: Lang, prompt: string) => createHash('sha256').update(`${lang}|${prompt.toLocaleLowerCase().replace(/\s+/g, ' ')}`).digest('hex').slice(0, 16);

export interface Written {
  accepted: PuzzleItem[];
  rejected: {prompt: string; why: string}[];
}

/**
 * Writes a batch and keeps what passes: the code checks, then every solver (each in its own order of answers; a
 * solver model listed twice solves twice). `have` also guards against the same question twice.
 */
export async function write(writer: AiModel, solvers: AiModel[], ask: WriteAsk, now = new Date()): Promise<Written> {
  const drafts = await draft(writer, ask);
  const seen = new Set(ask.have.map(q => itemId(ask.lang, q)));
  const out: Written = {accepted: [], rejected: []};
  // A few items at a time: the models' per-minute limits are low, and a solver that can't be reached drops the item
  // (it can be written again), never lets it through.
  for (let i = 0; i < drafts.length; i += AT_ONCE) {
    await Promise.all(drafts.slice(i, i + AT_ONCE).map(async item => {
      const id = itemId(ask.lang, item.prompt);
      const problems = problemsOf(item);
      if (seen.has(id)) problems.push('already in the bank');
      seen.add(id);
      if (problems.length) return void out.rejected.push({prompt: item.prompt, why: problems.join('; ')});
      const verdicts = await Promise.all(solvers.map((solver, n) =>
        solve(solver, item, ask.lang, ask.level, ORDERS[n % ORDERS.length]).catch((error): Verdict => ({ok: false, why: `a solver could not be reached (${String(error).slice(0, 60)})`}))));
      const failed = verdicts.find(v => !v.ok);
      if (failed) return void out.rejected.push({prompt: item.prompt, why: failed.why ?? 'a solver disagreed'});
      out.accepted.push({
        id, lang: ask.lang, subject: ask.subject, level: ask.level, ...item,
        source: {by: 'ai', model: writer.id, solvers: solvers.map(s => s.id).join(', '), at: now.toISOString().slice(0, 10)},
      });
    }));
  }
  return out;
}
