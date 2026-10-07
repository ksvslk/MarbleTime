/**
 * Making slow model calls dependable, whichever model it is.
 *
 * Vertex AI's latency for gemini-3.8-flash is bimodal (Oct 7: six identical tiny calls took 1.3, 2.0, 2.2, 12.6, 27.6
 * and 41.4 s), so a call in a request is hedged: if no attempt has answered after a few seconds, another starts, the
 * first valid answer wins and the others are aborted. Big calls outside requests (the drawing worker) get a generous
 * timeout and one retry instead: hedging them would multiply their cost.
 */
import type {AiModel, JsonAsk, TextAsk} from './model';

export interface Hedging {
  /** Start another attempt when none has answered for this long. */
  afterMs: number;
  /** Attempts running at once, at most. */
  maxInFlight: number;
  /** Attempts in all, at most (failures start a new one at once while this allows). */
  maxAttempts: number;
  /** Give up this long after the first attempt started. */
  deadlineMs: number;
  /**
   * With every slot busy, the next hedge replaces the oldest extra attempt (aborting it) rather than waiting: a call
   * stuck in the slow mode (12–90 s against 1–5 s) makes way for a fresh one. The first attempt is never replaced, so
   * a model that is slow every time still answers.
   */
  rotate?: boolean;
}

export interface Hedged<T> {
  value: T;
  /** Attempts started in all. */
  attempts: number;
  /** Which attempt answered (1-based). */
  winner: number;
  /** How long the winning attempt took. */
  ms: number;
  /** From the first attempt's start to the answer. */
  totalMs: number;
}

/** No valid answer: the deadline passed, or every attempt allowed failed. */
export class HedgeError extends Error {
  constructor(readonly reason: 'deadline' | 'exhausted', readonly attempts: number, readonly last?: unknown) {
    super(reason === 'deadline' ? `no valid answer before the deadline (${attempts} attempts)` : `no valid answer in ${attempts} attempts`);
    this.name = 'HedgeError';
  }
}

/** The reason a losing attempt is aborted with. */
export class Superseded extends Error {
  constructor() {
    super('another attempt answered first, or the deadline passed');
    this.name = 'AbortError';
  }
}

/**
 * Runs `attempt` hedged: one at first; another each `afterMs` while none has answered (at most `maxInFlight` at once,
 * rotating the extra ones with `rotate`, and `maxAttempts` in all); a failure (a throw, or an answer `valid` refuses)
 * starts a replacement at once. The first valid answer wins; every other attempt is aborted through its signal.
 * Rejects with HedgeError at `deadlineMs`, or when every allowed attempt has failed; and with the caller's `signal`'s
 * reason as soon as that aborts (a deadline of its own), stopping every attempt.
 */
export function hedge<T>(attempt: (signal: AbortSignal) => Promise<T>, valid: (value: T) => boolean, options: Hedging, signal?: AbortSignal): Promise<Hedged<T>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const started = Date.now();
    /** Running attempts by number, oldest first. */
    const running = new Map<number, AbortController>();
    /** Attempts replaced by rotation: their abort is not a failure. */
    const replaced = new Set<number>();
    let attempts = 0;
    let done = false;
    let last: unknown;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadlineTimer);
      signal?.removeEventListener('abort', onAbort);
      for (const controller of running.values()) controller.abort(new Superseded());
      running.clear();
      settle();
    };
    const onAbort = () => finish(() => reject(signal!.reason));
    signal?.addEventListener('abort', onAbort, {once: true});

    /** The hedge timer: another attempt, replacing the oldest extra one if every slot is busy and rotation is on. */
    const hedgeNow = () => {
      if (done) return;
      if (options.rotate && running.size >= options.maxInFlight && attempts < options.maxAttempts) {
        const oldest = [...running.keys()].find(number => number !== 1);
        if (oldest !== undefined) {
          replaced.add(oldest);
          running.get(oldest)!.abort(new Superseded());
          running.delete(oldest);
        }
      }
      start();
    };

    const start = () => {
      if (done || attempts >= options.maxAttempts || running.size >= options.maxInFlight) return;
      const number = ++attempts;
      const controller = new AbortController();
      running.set(number, controller);
      const t0 = Date.now();
      // The next hedge, counted from this start.
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(hedgeNow, options.afterMs);
      Promise.resolve().then(() => attempt(controller.signal)).then(value => {
        running.delete(number);
        if (done || replaced.has(number)) return;
        if (valid(value)) {
          const now = Date.now();
          finish(() => resolve({value, attempts, winner: number, ms: now - t0, totalMs: now - started}));
        } else {
          last = value;
          failed();
        }
      }, error => {
        running.delete(number);
        if (done || replaced.has(number)) return;
        last = error;
        failed();
      });
    };

    /** An attempt failed: replace it at once if allowed; with nothing left running and nothing allowed, give up. */
    const failed = () => {
      if (attempts < options.maxAttempts) start();
      else if (running.size === 0) finish(() => reject(new HedgeError('exhausted', attempts, last)));
    };

    deadlineTimer = setTimeout(() => finish(() => reject(new HedgeError('deadline', attempts, last))), options.deadlineMs);
    start();
  });
}

/** A timeout for one call. */
export class CallTimeout extends Error {
  constructor(ms: number) {
    super(`no answer within ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

/** Waits for `promise`, but rejects as soon as `signal` aborts (even if the call behind the promise ignores it). */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, {once: true});
    promise.then(value => {
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}

export interface Patience {
  /** Each call's limit. */
  timeoutMs: number;
  /** Calls again after a failure (a throw: timeouts, network, 5xx), this many times. */
  retries: number;
  /** For the log line (never the prompt). */
  label: string;
}

/**
 * The model with a timeout on every call and a retry after a failure (a throw). Unusable answers (refused, cut off…)
 * are answers: the caller decides about them.
 */
export function patient(model: AiModel, options: Patience): AiModel {
  async function call<A extends JsonAsk | TextAsk, R>(ask: A, run: (ask: A) => Promise<R>): Promise<R> {
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new CallTimeout(options.timeoutMs)), options.timeoutMs);
      const signal = ask.signal ? AbortSignal.any([ask.signal, controller.signal]) : controller.signal;
      const t0 = Date.now();
      try {
        const reply = await untilAborted(run({...ask, signal}), signal);
        if (attempt > 1) console.log(`${options.label} (${model.id}): answered on attempt ${attempt} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        return reply;
      } catch (error) {
        if (attempt > options.retries || ask.signal?.aborted) throw error;
        console.error(`${options.label} (${model.id}): attempt ${attempt} failed (${error instanceof Error ? error.name : 'Error'}); trying again`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return {
    id: model.id,
    json: ask => call(ask, a => model.json(a)),
    text: ask => call(ask, a => model.text(a)),
  };
}
