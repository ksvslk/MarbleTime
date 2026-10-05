import {bank, DAILY_GAME_MARBLES, isQuestionValid, Question, questionsFor} from '../data';
import {LANGS, STRINGS} from '../i18n';
import {fitFontSize, linesNeeded} from '../fit';
import {initialState, marblesIn, reducer, State} from '../logic';

describe('question checker (the app checks every question, including AI-made ones)', () => {
  it('accepts every question in the built-in bank, in every language', () => {
    for (const {id} of LANGS) for (const topic of Object.values(bank(id))) {
      for (const band of Object.values(topic)) {
        for (const q of band) expect(isQuestionValid(q)).toBe(true);
      }
    }
  });

  it('rejects a counting question whose answer does not match the picture', () => {
    const q: Question = {
      prompt: 'How many apples?', say: '', praise: '',
      picture: {kind: 'count', item: 'apple', n: 4},
      choices: [{kind: 'text', text: '3'}, {kind: 'text', text: '4'}, {kind: 'text', text: '5'}],
      answer: 0,
    };
    expect(isQuestionValid(q)).toBe(false);
  });

  it('rejects a pattern question with the wrong next shape', () => {
    const q: Question = {
      prompt: 'What comes next?', say: '', praise: '',
      picture: {kind: 'sequence', shapes: ['circle', 'triangle', 'circle', 'triangle', 'circle']},
      choices: [{kind: 'shape', shape: 'square'}, {kind: 'shape', shape: 'triangle'}, {kind: 'shape', shape: 'circle'}],
      answer: 2,
    };
    expect(isQuestionValid(q)).toBe(false);
  });

  it('rejects duplicate choices and wrong sums', () => {
    const dup: Question = {
      prompt: '', say: '', praise: '',
      picture: {kind: 'sentence', before: '7 + 5 =', after: ''},
      choices: [{kind: 'text', text: '12'}, {kind: 'text', text: '12'}, {kind: 'text', text: '13'}],
      answer: 0,
    };
    expect(isQuestionValid(dup)).toBe(false);
    const wrongSum = {...dup, choices: [{kind: 'text', text: '11'}, {kind: 'text', text: '12'}, {kind: 'text', text: '13'}], answer: 0} as Question;
    expect(isQuestionValid(wrongSum)).toBe(false);
  });

  it('gives young kids picture questions and older kids text questions', () => {
    expect(questionsFor('numbers', 5)[0].picture.kind).toBe('count');
    expect(questionsFor('numbers', 8)[0].picture.kind).toBe('sentence');
    expect(questionsFor('words', 5).length).toBe(3); // no young word bank yet: falls back to the older one
  });
});

describe('jar and approvals', () => {
  const claimed = (s: State) => reducer(s, {type: 'claim', kidId: 'mia', jobId: 'toys'});

  it('a claim waits for a grown-up and does not add time on its own', () => {
    const s = claimed(initialState);
    expect(s.claims).toHaveLength(1);
    expect(s.claims[0].status).toBe('waiting');
    expect(s.balances.mia).toBe(initialState.balances.mia);
  });

  it('"Yes" adds the minutes and queues a celebration; "Not yet" adds nothing', () => {
    const s = claimed(initialState);
    const yes = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    expect(yes.balances.mia).toBe(initialState.balances.mia + 10);
    expect(yes.celebrations).toEqual([{kidId: 'mia', marbles: 2, jobId: 'toys'}]);
    const no = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: false, minutes: 0});
    expect(no.balances.mia).toBe(initialState.balances.mia);
    expect(no.celebrations).toHaveLength(0);
  });

  it('a decision only counts once', () => {
    const s = claimed(initialState);
    const once = reducer(s, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    const twice = reducer(once, {type: 'decide', claimId: s.claims[0].id, yes: true, minutes: 10});
    expect(twice.balances.mia).toBe(once.balances.mia);
  });

  it('claiming the same job twice does not make two claims', () => {
    expect(claimed(claimed(initialState)).claims).toHaveLength(1);
  });

  it('games pay marbles straight away, up to the daily cap', () => {
    let s = initialState;
    for (let i = 0; i < 3; i++) s = reducer(s, {type: 'gameDone', kidId: 'mia', marbles: 2, gameId: 'numbers'});
    expect(s.gameMarblesToday.mia).toBe(DAILY_GAME_MARBLES);
    expect(s.balances.mia).toBe(initialState.balances.mia + DAILY_GAME_MARBLES * 5);
  });

  it('one marble is five minutes', () => {
    expect(marblesIn(35)).toBe(7);
    expect(marblesIn(39)).toBe(7);
  });
});

describe('translations', () => {
  it('every language has every text, with the same {holes} as English', () => {
    const holes = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const {id} of LANGS) {
      for (const [key, value] of Object.entries(STRINGS.en)) {
        const other = (STRINGS[id] as Record<string, string>)[key];
        expect(other && other.length > 0).toBe(true);
        expect(holes(other)).toBe(holes(value));
      }
    }
  });
});

describe('text fitting for user content', () => {
  it('keeps short text at full size', () => {
    expect(fitFontSize('Mia', 400, 84, 40, 1)).toBe(84);
  });
  it('shrinks a long name to fit one line', () => {
    const size = fitFontSize('Maximilian-Alexander', 400, 84, 30, 1);
    expect(size).toBeLessThan(84);
    expect(linesNeeded('Maximilian-Alexander', 400, size)).toBe(1);
  });
  it('fits a long German job title on a card (3 lines) without cutting it off', () => {
    const text = 'Geschirrspülmaschine ausräumen und Küche wischen';
    const size = fitFontSize(text, 280, 42, 20, 3);
    expect(linesNeeded(text, 280, size)).toBeLessThanOrEqual(3);
    expect(size).toBeGreaterThan(20);
  });
  it('never goes below the minimum, even for one huge word', () => {
    expect(fitFontSize('Supercalifragilisticexpialidocious', 100, 42, 24, 2)).toBe(24);
  });
  it('respects explicit line breaks', () => {
    expect(linesNeeded('Great job,\nMia!', 2000, 150)).toBe(2);
  });
});
