import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {AiModel, JsonAsk, JsonReply, TextAsk, TextReply} from '../src/ai/model';
import {CallTimeout, hedge, HedgeError, type Hedging, patient} from '../src/ai/resilience';
import {DIRECTOR_HEDGING, direct} from '../src/domain/characters';

/** One attempt of a fake call: answers (or fails) after `ms`, unless aborted first. */
type Step<T> = {ms: number; value?: T; error?: Error; ignoresAbort?: boolean};

/** A fake call whose attempts follow `plan` in order; records when each started and whether it was aborted. */
function planned<T>(plan: Step<T>[]) {
  const log: {started: number; aborted: boolean}[] = [];
  const attempt = (signal: AbortSignal) => {
    const step = plan[log.length];
    const entry = {started: Date.now(), aborted: false};
    log.push(entry);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => (step.error ? reject(step.error) : resolve(step.value as T)), step.ms);
      signal.addEventListener('abort', () => {
        entry.aborted = true;
        if (step.ignoresAbort) return;
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  };
  return {attempt, log};
}

const OPTIONS: Hedging = {afterMs: 3000, maxInFlight: 3, maxAttempts: 5, deadlineMs: 25_000};
const always = () => true;

/** Lets fake time run until the promise settles (or `limit` ms pass). */
async function settle<T>(promise: Promise<T>, limit = 120_000): Promise<{value?: T; error?: unknown}> {
  let outcome: {value?: T; error?: unknown} | undefined;
  promise.then(value => (outcome = {value}), error => (outcome = {error}));
  for (let waited = 0; !outcome && waited < limit; waited += 100) await vi.advanceTimersByTimeAsync(100);
  return outcome ?? {error: new Error('still running')};
}

describe('hedged calls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('takes a quick first answer and starts nothing else', async () => {
    const {attempt, log} = planned([{ms: 1300, value: 'card'}]);
    const {value} = await settle(hedge(attempt, always, OPTIONS));
    expect(value).toEqual({value: 'card', attempts: 1, winner: 1, ms: 1300, totalMs: 1300});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log).toHaveLength(1);
  });

  it('starts another attempt when none has answered for 3 s, takes the first answer and aborts the rest', async () => {
    const {attempt, log} = planned([{ms: 12_600, value: 'slow'}, {ms: 2000, value: 'quick'}]);
    const {value} = await settle(hedge(attempt, always, OPTIONS));
    expect(value).toEqual({value: 'quick', attempts: 2, winner: 2, ms: 2000, totalMs: 5000});
    expect(log).toEqual([{started: 0, aborted: true}, {started: 3000, aborted: false}]);
  });

  it('turns Vertex\'s bimodal latency (12.6, 27.6, 2.0 s) into an answer at 8 s instead of 12.6 s', async () => {
    const {attempt, log} = planned([{ms: 12_600, value: 'a'}, {ms: 27_600, value: 'b'}, {ms: 2000, value: 'c'}]);
    const {value} = await settle(hedge(attempt, always, OPTIONS));
    expect(value).toMatchObject({value: 'c', attempts: 3, winner: 3, ms: 2000, totalMs: 8000});
    expect(log.map(l => [l.started, l.aborted])).toEqual([[0, true], [3000, true], [6000, false]]);
  });

  it('runs at most 3 at once, and stops at the deadline, aborting all', async () => {
    const {attempt, log} = planned([{ms: 41_400, value: 'a'}, {ms: 41_400, value: 'b'}, {ms: 41_400, value: 'c'}, {ms: 1000, value: 'd'}]);
    const {error} = await settle(hedge(attempt, always, OPTIONS));
    expect(error).toBeInstanceOf(HedgeError);
    expect(error).toMatchObject({reason: 'deadline', attempts: 3});
    expect(Date.now()).toBeLessThanOrEqual(25_100);
    expect(log.map(l => [l.started, l.aborted])).toEqual([[0, true], [3000, true], [6000, true]]);
  });

  it('with every slot busy, replaces the oldest extra attempt (never the first) and takes a fresh quick answer', async () => {
    const {attempt, log} = planned([{ms: 41_400, value: 'a'}, {ms: 41_400, value: 'b'}, {ms: 41_400, value: 'c'}, {ms: 2000, value: 'd'}]);
    const {value} = await settle(hedge(attempt, always, {...OPTIONS, rotate: true}));
    expect(value).toMatchObject({value: 'd', attempts: 4, winner: 4, ms: 2000, totalMs: 11_000});
    // At 9 s the second attempt made way for the fourth; the first and the third ran until the answer.
    expect(log.map(l => [l.started, l.aborted])).toEqual([[0, true], [3000, true], [6000, true], [9000, false]]);
  });

  it('still answers when the model is slow every time: the first attempt is never replaced', async () => {
    const {attempt, log} = planned(Array.from({length: 8}, () => ({ms: 15_000, value: 'slow'})));
    const {value} = await settle(hedge(attempt, always, {...OPTIONS, maxAttempts: 8, rotate: true}));
    expect(value).toMatchObject({winner: 1, ms: 15_000, totalMs: 15_000});
    expect(log.length).toBeGreaterThan(3);
  });

  it('replaces a failed attempt at once instead of waiting 3 s', async () => {
    const {attempt, log} = planned([{ms: 500, error: Object.assign(new Error('busy'), {name: 'VertexError'})}, {ms: 1000, value: 'card'}]);
    const {value} = await settle(hedge(attempt, always, OPTIONS));
    expect(value).toMatchObject({value: 'card', attempts: 2, winner: 2, totalMs: 1500});
    expect(log.map(l => l.started)).toEqual([0, 500]);
  });

  it('counts an answer that isn\'t valid as a failed attempt', async () => {
    const {attempt} = planned([{ms: 200, value: 'cut off'}, {ms: 300, value: 'card'}]);
    const {value} = await settle(hedge(attempt, value => value === 'card', OPTIONS));
    expect(value).toMatchObject({value: 'card', winner: 2, totalMs: 500});
  });

  it('gives up when every allowed attempt has failed, with the last failure', async () => {
    const failure = new Error('connect ECONNREFUSED');
    const {attempt, log} = planned(Array.from({length: 5}, (_, i) => ({ms: 100 * (i + 1), error: failure})));
    const {error} = await settle(hedge(attempt, always, OPTIONS));
    expect(error).toMatchObject({reason: 'exhausted', attempts: 5, last: failure});
    expect(log).toHaveLength(5);
  });

  it("stops every attempt when the caller's signal aborts (a deadline of its own), and starts none if it already has", async () => {
    const {attempt, log} = planned([{ms: 20_000, value: 'slow'}, {ms: 20_000, value: 'slower'}]);
    const caller = new AbortController();
    const run = settle(hedge(attempt, always, OPTIONS, caller.signal));
    await vi.advanceTimersByTimeAsync(4000);
    caller.abort(new Error('the line took too long'));
    expect((await run).error).toMatchObject({message: 'the line took too long'});
    expect(log).toEqual([{started: 0, aborted: true}, {started: 3000, aborted: true}]);
    const unused = planned([{ms: 10, value: 'x'}]);
    expect((await settle(hedge(unused.attempt, always, OPTIONS, caller.signal))).error).toMatchObject({message: 'the line took too long'});
    expect(unused.log).toEqual([]);
  });

  it('keeps the first answer when a losing attempt ignores the abort and answers later', async () => {
    const {attempt, log} = planned([{ms: 5000, value: 'late', ignoresAbort: true}, {ms: 1000, value: 'first'}]);
    const {value} = await settle(hedge(attempt, always, OPTIONS));
    expect(value).toMatchObject({value: 'first', winner: 2});
    await vi.advanceTimersByTimeAsync(10_000); // the late answer arrives and changes nothing
    expect(log[0].aborted).toBe(true);
  });
});

/** A model whose calls follow a plan (answers, failures, hangs) and that honours abort signals. */
class TimedModel implements AiModel {
  readonly id = 'timed';
  readonly calls: {started: number; aborted: boolean}[] = [];
  constructor(private readonly plan: Step<JsonReply>[]) {}

  json(ask: JsonAsk): Promise<JsonReply> {
    const run = planned(this.plan.slice(this.calls.length));
    const promise = run.attempt(ask.signal ?? new AbortController().signal);
    this.calls.push(run.log[0]);
    return promise;
  }

  async text(_: TextAsk): Promise<TextReply> {
    throw new Error('not used');
  }
}

const card = (name: string): JsonReply => ({
  value: {answer: {result: 'character', name, voice: 'Leda', card: {what: 'a dragon', colours: ['green'], outfit: 'a hat', mood: 'happy', detail: 'pancakes'}}},
  stop: 'done', usage: {inputTokens: 1, outputTokens: 1},
});

describe('the art director, hedged', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers from the quickest attempt and logs only attempt counts and timings', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args.join(' ')));
    const model = new TimedModel([{ms: 27_600, value: card('Slow')}, {ms: 1300, value: card('Quick')}]);
    const {value} = await settle(direct(model, 'a secret dragon who loves pancakes', 'en'));
    expect(value).toMatchObject({ok: true, name: 'Quick'});
    expect(model.calls.map(c => [c.started, c.aborted])).toEqual([[0, true], [3000, false]]);
    expect(logged).toEqual(['art director (timed): attempt 2 of 2 answered in 1.3 s (4.3 s in all)']);
  });

  it('stays inside the API Lambda: no answer by 25 s is a 503, every attempt aborted', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.join(' ')));
    const model = new TimedModel(Array.from({length: DIRECTOR_HEDGING.maxAttempts}, () => ({ms: 41_400, value: card('Never')})));
    const {error} = await settle(direct(model, 'a secret dragon', 'en'));
    expect(error).toMatchObject({status: 503, code: 'unavailable'});
    expect(Date.now()).toBeLessThanOrEqual(DIRECTOR_HEDGING.deadlineMs + 100);
    expect(model.calls.every(c => c.aborted)).toBe(true);
    // Every 3 s a fresh attempt, the extra ones rotating, 3 at once at most: 8 tries inside 25 s.
    expect(model.calls.map(c => c.started)).toEqual([0, 3000, 6000, 9000, 12_000, 15_000, 18_000, 21_000]);
    expect(errors).toEqual(['art director (timed) failed: nothing before the deadline in 8 attempts; last: none']);
    expect(errors.join()).not.toContain('secret');
  });
});

describe('a timeout and one retry (the drawing worker)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const reply = (text: string): TextReply => ({text, stop: 'done', usage: {inputTokens: 1, outputTokens: 1}});

  /** A model whose text calls follow a plan; each call may hang (and ignore aborts). */
  function textModel(plan: Step<TextReply>[]) {
    const calls: {started: number; aborted: boolean}[] = [];
    const model: AiModel = {
      id: 'slow-model',
      json: async () => {
        throw new Error('not used');
      },
      text: ask => {
        const run = planned(plan.slice(calls.length));
        const promise = run.attempt(ask.signal!);
        calls.push(run.log[0]);
        return promise;
      },
    };
    return {model, calls};
  }

  it('times a call out after 90 s and tries once more', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.join(' ')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const {model, calls} = textModel([{ms: 141_000, value: reply('too late')}, {ms: 23_000, value: reply('<svg/>')}]);
    const {value} = await settle(patient(model, {timeoutMs: 90_000, retries: 1, label: 'drawing'}).text({user: 'draw'}), 200_000);
    expect(value).toEqual(reply('<svg/>'));
    expect(calls.map(c => [c.started, c.aborted])).toEqual([[0, true], [90_000, false]]);
    expect(errors).toEqual(['drawing (slow-model): attempt 1 failed (TimeoutError); trying again']);
  });

  it('gives up after the retry with the last failure, even when the call ignores the abort', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {model} = textModel([{ms: 500_000, value: reply('x'), ignoresAbort: true}, {ms: 500_000, value: reply('y'), ignoresAbort: true}]);
    const {error} = await settle(patient(model, {timeoutMs: 90_000, retries: 1, label: 'drawing'}).text({user: 'draw'}), 200_000);
    expect(error).toBeInstanceOf(CallTimeout);
    expect(Date.now()).toBeLessThanOrEqual(180_100);
  });

  it('passes unusable answers through without a retry (the worker decides about those)', async () => {
    const {model, calls} = textModel([{ms: 1000, value: {text: '<svg', stop: 'cut_off', usage: {inputTokens: 1, outputTokens: 1}}}]);
    const {value} = await settle(patient(model, {timeoutMs: 90_000, retries: 1, label: 'drawing'}).text({user: 'draw'}));
    expect(value).toMatchObject({stop: 'cut_off'});
    expect(calls).toHaveLength(1);
  });
});
