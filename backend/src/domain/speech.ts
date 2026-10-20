/**
 * Speech (docs/08, Decisions 5–6), both ways, in the family's language (en, et, de, es):
 * - POST /device/speech: a short line on the TV, as a loudness-normalised WAV and the mouth's movement
 *   (src/speech/gemini-tts.ts). A character says it in character: its Gemini voice, with a speaking style composed
 *   from fixed parts (voice-style.ts). Without a character the narrator says it: the TV's read-aloud voice, exactly
 *   as its recorded clips (scripts/make-voices.py), for the family's own words. Every new line is checked before it
 *   is kept (line-check.ts): not far longer than its words need, and heard back by Gemini as the same words. Tries go
 *   on one at a time, up to 6, even after the request has answered 503 at 24 s (the TV stays silent rather than say a
 *   wrong word): the line that passes is cached for the next request. One maker per line, wherever it runs (a lease).
 *   A line is made once: it is cached by sha256(model|voice|style|lang|text), "narrator|" first for the narrator's.
 *   New lines are limited per TV and hour; cached ones aren't.
 * - POST /speech-to-text: the kid's idea, spoken into the parent's phone, as text: Gemini listens
 *   (src/speech/gemini-listen.ts). The audio and the words are never stored or logged.
 */
import type {Mouth} from '../speech/audio';
import {isSilent, parseWav, samplesOf, WavError, wavFile} from '../speech/audio';
import type {Deps} from './deps';
import {ApiError} from './errors';
import {heardScore, MIN_MATCH, maxSpeechMs} from './line-check';
import {takeHourly} from './rate';
import {newId, sha256Hex} from './secrets';
import {type Device, type Family, type Lang, type Voice, voiceOf} from './types';
import {isId, type SpeechInput} from './validate';
import {NARRATOR_VOICE, narratorStyle, voicePrompt} from './voice-style';

export type {Mouth};

/** A line as the TV gets it (Speech in the contract). */
export interface SpokenLine {
  /** The WAV (24 kHz mono 16-bit), valid for at least a day. */
  audioUrl: string;
  durationMs: number;
  mouth: Mouth;
}

/** A line as it is kept and played: the finished WAV, its length and the mouth. */
export interface LineAudio {
  audio: Buffer;
  durationMs: number;
  mouth: Mouth;
}

/** A line as the voice made it. */
export interface Synthesis extends LineAudio {
  /** How long the speech itself runs, without the silence the voice put around it: what the length check reads. */
  speechMs: number;
}

export interface Line {
  text: string;
  voice: Voice;
  lang: Lang;
  /** How to say it: fixed instructions (voice-style.ts). */
  style: string;
}

export interface Synthesizer {
  /** The voice model: part of the cache key, so another model makes new audio. */
  readonly model: string;
  /** Speaks `text` in `voice` and `lang`, as `style` says; stops when `signal` aborts. */
  synthesize(line: Line, signal?: AbortSignal): Promise<Synthesis>;
}

/** What a made line says, heard back in its language (a WAV in); stops when `signal` aborts. */
export type ListenBack = (wav: Buffer, lang: Lang, signal?: AbortSignal) => Promise<string>;

/** Where made lines are kept (S3 in AWS, a folder on the dev server), with URLs valid for at least a day. */
export interface SpeechCache {
  get(key: string): Promise<SpokenLine | undefined>;
  put(key: string, line: LineAudio): Promise<SpokenLine>;
}

export interface SpeechServices {
  /** The characters' voices. */
  synth: Synthesizer;
  /** The narrator's voice: the model and finish of the TV's recorded clips, whatever the characters use. */
  narrator: Synthesizer;
  cache: SpeechCache;
  /** The kid's words from a 16 kHz mono 16-bit WAV, in the family's language ('' when nothing was said). */
  listen: (wav: Buffer, lang: Lang) => Promise<string>;
  /**
   * Hears every new line back before it is kept. Always there in AWS; the dev server leaves it out only with a fake
   * voice or fake ears (a hum says no words).
   */
  listenBack?: ListenBack;
  /**
   * Goes on elsewhere with a line its request couldn't finish in 24 s (Lambda: the worker, by an async invoke; it calls
   * continueLine), since nothing in a Lambda outlives its response. Without it (the dev server, tests) the line goes
   * on in this process after the request has answered.
   */
  handOff?: (job: LineJob) => Promise<void>;
}

/** A line handed to the worker Lambda to go on with (its event). */
export interface SpeechWork {
  kind: 'speech';
  job: LineJob;
}

/** A new line being made: what to say, by which voice, under which cache key, and how many tries so far. */
export interface LineJob {
  /** Holds the line's lease while it is made: one maker at a time, wherever it runs. */
  id: string;
  key: string;
  line: Line;
  /** The narrator's voice, or the characters'. */
  narrator: boolean;
  /** The voice model the key was made for: a maker on another model can't make this key. */
  model: string;
  /** Tries finished so far. */
  tries: number;
}

/** New lines a TV may make per hour (cached lines don't count). */
export const LINES_PER_HOUR = 60;
/** Tries in all at a line that passes its check, one at a time: in the request, then in the background. */
export const LINE_TRIES = 6;
/** How long a request waits for a new line before a 503; the line goes on (the API Lambda has 28 s, API Gateway 30 s). */
export const SPEECH_DEADLINE_MS = 24_000;
/** A line's lease runs this long from each try's start: more than a try can take (the voice 20 s, hearing back 15 s). */
export const LINE_LEASE_MS = 90_000;
/** Ideas a family may turn from speech into text per hour (each up to 15 s of audio). */
export const TRANSCRIPTS_PER_HOUR = 60;

/** The cache key: sha256(model|voice|style|lang|text), with "narrator|" first for the narrator's lines. */
export const lineKey = (line: {model: string; voice: Voice; style: string; lang: Lang; text: string; narrator?: boolean}) =>
  sha256Hex(`${line.narrator ? 'narrator|' : ''}${line.model}|${line.voice}|${line.style}|${line.lang}|${line.text}`);

/** Who says a line: a ready character of the TV's family (else 404 not_found), or the narrator without one. */
async function speaker(deps: Deps, family: Family, characterId: string | undefined, lang: Lang) {
  if (characterId === undefined) return {synth: deps.speech.narrator, voice: NARRATOR_VOICE, style: narratorStyle(lang), narrator: true};
  const character = isId(characterId) ? await deps.repo.getCharacter(family.id, characterId) : undefined;
  if (character?.status !== 'ready') throw new ApiError(404, 'not_found', 'No such ready character in this family');
  return {synth: deps.speech.synth, voice: voiceOf(character.voice), style: voicePrompt(character, lang), narrator: false};
}

const leaseName = (key: string) => `speech#${key}`;
const stillMaking = () => new ApiError(503, 'unavailable', 'This line is still being made; ask for it again in a minute');

type LineDeps = Pick<Deps, 'repo' | 'now' | 'speech'>;

/** Lines being made in this process, per set of speech services (each test has its own), by cache key. */
const makingHere = new WeakMap<SpeechServices, Map<string, Promise<SpokenLine>>>();
function linesMadeHere(speech: SpeechServices) {
  let lines = makingHere.get(speech);
  if (!lines) makingHere.set(speech, (lines = new Map()));
  return lines;
}

/** Why a line's maker in a request stopped: the rest goes on elsewhere (SpeechServices.handOff). */
class HandedOff extends Error {
  constructor() {
    super('the line goes on elsewhere');
    this.name = 'AbortError';
  }
}

/**
 * Makes the job's line, one try at a time, until a try passes its check (line-check.ts: not far longer than its words
 * need, and heard back as the same words) or LINE_TRIES are used, and caches the one that passes. Audio that couldn't
 * be heard back (the listener failed, not the voice) is heard again on the next try rather than made again: the
 * voice's quota is the scarce one. Renews the lease before each try and lets it go at the end, unless `signal` stopped
 * it for a hand-off (whoever goes on keeps it). A Google sign-in problem or a cache that can't store ends it at once.
 * Logs tries, seconds and scores, never the words.
 */
async function makeLine(deps: LineDeps, job: LineJob, signal?: AbortSignal): Promise<SpokenLine> {
  const synth = job.narrator ? deps.speech.narrator : deps.speech.synth;
  const longest = maxSpeechMs(job.line.text);
  let keepLease = false;
  /** Made, but not heard back yet (the listener failed). */
  let unheard: Synthesis | undefined;
  /** A failed step: stops the line for a hand-off or a sign-in problem; otherwise counts the try. */
  const failed = (tried: string, step: string, error: unknown) => {
    if (signal?.aborted) throw error;
    // A sign-in problem, or a language with no voice here: no use trying again.
    if (error instanceof Error && (error.name === 'GoogleAuthError' || error.name === 'NoVoiceError')) throw unavailable('speech', error);
    console.warn(`${tried}: ${step} failed (${error instanceof Error ? error.name : 'Error'})`);
    job.tries++;
  };
  try {
    while (job.tries < LINE_TRIES) {
      signal?.throwIfAborted();
      const now = deps.now();
      if (!(await deps.repo.takeLease(leaseName(job.key), job.id, now + LINE_LEASE_MS, now))) {
        keepLease = true; // ours ran out and someone else took it: theirs to finish
        throw stillMaking();
      }
      const tried = `speech (${synth.model}): try ${job.tries + 1} of ${LINE_TRIES}`;
      let made: Synthesis;
      try {
        made = unheard ?? (await synth.synthesize(job.line, signal));
      } catch (error) {
        failed(tried, 'the voice', error);
        continue;
      }
      unheard = undefined;
      let heard: string | undefined;
      if (made.speechMs <= longest && deps.speech.listenBack) {
        try {
          heard = await deps.speech.listenBack(made.audio, job.line.lang, signal);
        } catch (error) {
          failed(tried, 'hearing it back', error);
          unheard = made;
          continue;
        }
      }
      job.tries++;
      if (made.speechMs > longest) {
        console.warn(`${tried} has ${(made.speechMs / 1000).toFixed(1)} s of speech, more than ${(longest / 1000).toFixed(1)} s`);
        continue;
      }
      const score = heard === undefined ? undefined : heardScore(job.line.text, heard);
      if (score !== undefined && score < MIN_MATCH) {
        console.warn(`${tried} heard back wrong (score ${score.toFixed(2)})`);
        continue;
      }
      console.log(`${tried} ${score === undefined ? 'kept, not heard back' : `heard back right (score ${score.toFixed(2)})`}, ${(made.speechMs / 1000).toFixed(1)} s of speech`);
      return await speechService('speech', () => deps.speech.cache.put(job.key, made));
    }
    throw new ApiError(503, 'unavailable', `The voice didn't make this line right in ${LINE_TRIES} tries; the TV stays silent`);
  } catch (error) {
    // Stopped for a hand-off: whoever goes on with the line holds the lease now.
    if (signal?.aborted && !(error instanceof ApiError)) keepLease = true;
    throw error;
  } finally {
    if (!keepLease) await deps.repo.releaseLease(leaseName(job.key), job.id).catch(error => console.error(`speech: letting a line go failed: ${error instanceof Error ? error.name : 'Error'}`));
  }
}

/** The promise's outcome, or undefined if it hasn't settled within `ms`. */
async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<{value: T} | {error: unknown} | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>(resolve => (timer = setTimeout(resolve, ms, undefined)));
  try {
    return await Promise.race([promise.then(value => ({value}), (error: unknown) => ({error})), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /device/speech: a line said by a ready character of the TV's family (404 not_found for any other id) or by the
 * narrator. A cached line comes at once. A new one is waited for up to SPEECH_DEADLINE_MS: a line being made in this
 * process is joined, one being made elsewhere is a 503 (never a second maker), and a new maker counts against the
 * TV's hourly limit (429 too_many). Past the deadline the answer is 503 and the line goes on in the background (here,
 * or through SpeechServices.handOff), cached for the next request once a try passes. 503 also when the voice or the
 * cache can't help.
 */
export async function speak(deps: Deps, family: Family, device: Device, input: SpeechInput): Promise<SpokenLine> {
  const {synth, narrator, ...voice} = await speaker(deps, family, input.characterId, input.lang);
  const line = {text: input.text, lang: input.lang, ...voice};
  const key = lineKey({...line, model: synth.model, narrator});
  const cached = await speechService('speech', () => deps.speech.cache.get(key));
  if (cached) return cached;
  const lines = linesMadeHere(deps.speech);
  const running = lines.get(key);
  if (running) {
    const outcome = await settleWithin(running, SPEECH_DEADLINE_MS);
    if (!outcome) throw stillMaking();
    if ('error' in outcome) throw outcome.error instanceof ApiError ? outcome.error : stillMaking();
    return outcome.value;
  }
  const job: LineJob = {id: newId(), key, line, narrator, model: synth.model, tries: 0};
  const stop = new AbortController();
  const made = (async () => {
    // Being made elsewhere (another Lambda, the worker): no second maker.
    if (!(await deps.repo.takeLease(leaseName(key), job.id, deps.now() + LINE_LEASE_MS, deps.now()))) throw stillMaking();
    try {
      // Made just now by a maker that has let go (it stores the line first).
      const madeMeanwhile = await speechService('speech', () => deps.speech.cache.get(key));
      if (madeMeanwhile) {
        await deps.repo.releaseLease(leaseName(key), job.id);
        return madeMeanwhile;
      }
      await takeHourly(deps, family.id, `speech#${device.id}`, LINES_PER_HOUR, `This TV made ${LINES_PER_HOUR} new lines this hour; lines it made before still work`);
    } catch (error) {
      await deps.repo.releaseLease(leaseName(key), job.id);
      throw error;
    }
    return makeLine(deps, job, deps.speech.handOff && stop.signal);
  })();
  lines.set(key, made);
  const done = () => {
    if (lines.get(key) === made) lines.delete(key);
  };
  made.then(done, error => {
    done();
    if (!(error instanceof ApiError || error instanceof HandedOff)) console.error(`speech: making a line failed: ${error instanceof Error ? error.name : 'Error'}`);
  });
  const outcome = await settleWithin(made, SPEECH_DEADLINE_MS);
  if (outcome && 'value' in outcome) return outcome.value;
  if (outcome) throw outcome.error instanceof ApiError ? outcome.error : unavailable('speech', outcome.error);
  // Still no right line: answer, and let it go on.
  const handOff = deps.speech.handOff;
  if (!handOff) {
    console.log(`speech (${synth.model}): no right line in ${SPEECH_DEADLINE_MS / 1000} s (${job.tries} of ${LINE_TRIES} tries done); going on in the background`);
    throw stillMaking();
  }
  stop.abort(new HandedOff());
  const stopped = await settleWithin(made, 2000);
  if (stopped && 'value' in stopped) return stopped.value; // it passed just then
  if (stopped && stopped.error instanceof ApiError) throw stopped.error; // or ended just then
  try {
    await handOff({...job});
    console.log(`speech (${synth.model}): no right line in ${SPEECH_DEADLINE_MS / 1000} s (${job.tries} of ${LINE_TRIES} tries done); handed on`);
  } catch (error) {
    console.error(`speech: handing a line on failed: ${error instanceof Error ? error.name : 'Error'}`);
    await deps.repo.releaseLease(leaseName(key), job.id);
  }
  throw stillMaking();
}

/**
 * Goes on with a line a request handed off (the worker Lambda): the tries it has left, holding its lease, caching the
 * one that passes. Drops it if this maker's voice model isn't the one the key was made for.
 */
export async function continueLine(deps: LineDeps, job: LineJob): Promise<'made' | 'not_made' | 'dropped'> {
  const synth = job.narrator ? deps.speech.narrator : deps.speech.synth;
  if (synth.model !== job.model) {
    console.warn(`speech: a line for ${job.model} can't be made on ${synth.model}; dropped`);
    await deps.repo.releaseLease(leaseName(job.key), job.id);
    return 'dropped';
  }
  try {
    await makeLine(deps, job);
    return 'made';
  } catch (error) {
    console.warn(`speech (${job.model}): line not made after ${job.tries} tries (${error instanceof Error ? error.name : 'Error'})`);
    return 'not_made';
  }
}

/**
 * A speech step whose failures (the voice, the listener, S3, CloudFront signing) are a 503 the TV and the phone can live
 * with. A Google sign-in problem says what to do; anything else is "not now". Logs only the error's name.
 */
async function speechService<T>(what: 'speech' | 'listening', step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    throw unavailable(what, error);
  }
}

/** A failed speech step as the 503 it answers (ApiErrors stay as they are); logs only the error's name. */
function unavailable(what: 'speech' | 'listening', error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const name = error instanceof Error ? error.name : 'Error';
  console.error(`${what} failed: ${name}`);
  if (name === 'GoogleAuthError' || name === 'NoVoiceError') return new ApiError(503, 'unavailable', (error as Error).message);
  return new ApiError(503, 'unavailable', what === 'speech' ? "Speech can't be made right now; try again in a minute" : "Listening isn't available right now; type the words instead");
}

// ---------- Speech to text ----------

export const SAMPLE_RATE = 16_000;
export const MAX_SECONDS = 15;
/** 15 s of 16 kHz mono 16-bit audio. */
export const MAX_PCM_BYTES = MAX_SECONDS * SAMPLE_RATE * 2;
/** A whole WAV body: the audio plus room for its header chunks. */
export const MAX_WAV_BYTES = MAX_PCM_BYTES + 4096;

const FORMAT = 'audio must be a 16 kHz mono 16-bit PCM WAV file';
const badAudio = (problem: string) => new ApiError(400, 'bad_audio', `${FORMAT}: ${problem}`);
const tooLong = (seconds: number) =>
  new ApiError(413, 'too_large', `At most ${MAX_SECONDS} seconds of audio${seconds > 0 ? ` (this is ${seconds.toFixed(1)} s)` : ''}`);

/** The PCM samples of a 16 kHz mono 16-bit WAV; 400 bad_audio for any other format, 413 too_large for more than 15 seconds. */
export function readWav(body: Buffer): Buffer {
  if (body.length > MAX_WAV_BYTES) throw tooLong((body.length - 44) / (SAMPLE_RATE * 2));
  let wav;
  try {
    wav = parseWav(body);
  } catch (error) {
    if (error instanceof WavError) throw badAudio(error.problem);
    throw error;
  }
  if (wav.format !== 1) throw badAudio(`it is not PCM (format ${wav.format})`);
  if (wav.channels !== 1) throw badAudio(`it has ${wav.channels} channels`);
  if (wav.sampleRate !== SAMPLE_RATE) throw badAudio(`it is ${wav.sampleRate} Hz`);
  if (wav.bits !== 16) throw badAudio(`it is ${wav.bits}-bit`);
  if (wav.pcm.length > MAX_PCM_BYTES) throw tooLong(wav.pcm.length / (SAMPLE_RATE * 2));
  return wav.pcm;
}

/**
 * POST /speech-to-text, in the family's language. The checked samples go to the listener as a plain WAV (only the
 * format and data chunks of what the phone sent). No audio, or a recording with nothing louder than a quiet room, is
 * "" without asking the model (listening models invent words for silence). Limited per family and hour.
 */
export async function speechToText(deps: Deps, family: Family, body: Buffer): Promise<{text: string}> {
  const samples = samplesOf(readWav(body));
  if (isSilent(samples, SAMPLE_RATE)) return {text: ''};
  await takeHourly(deps, family.id, 'transcribe', TRANSCRIPTS_PER_HOUR, `This family turned ${TRANSCRIPTS_PER_HOUR} ideas into text this hour; type the words instead`);
  const text = await speechService('listening', () => deps.speech.listen(wavFile(samples, SAMPLE_RATE), family.lang));
  return {text: text.replace(/\s+/g, ' ').trim()};
}
