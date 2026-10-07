/**
 * The voices: Google Cloud Text-to-Speech with Gemini-TTS, in the family's language. The characters' voices use
 * TTS_MODEL (default gemini-2.5-flash-tts; gemini-2.5-pro-tts and gemini-2.5-flash-lite-preview-tts work too) and
 * speak in character: the speaking style is composed by the domain from fixed parts (domain/voice-style.ts); the
 * words are the TV's own template. The narrator always uses the model of the TV's recorded clips and is finished like
 * them (scripts/make-voices.py), so the family's own words sound like the rest of the read-aloud.
 *
 * Each line comes back as 24 kHz mono 16-bit PCM in a WAV, is normalised to -16 LUFS with peaks under -1.5 dBFS
 * (audio.ts), and gets the mouth's movement from its loudness. Calls are hedged modestly (src/ai/resilience.ts; the
 * project's per-minute TTS quota is low): a second attempt when none has answered for 5 s, never more than 2 at once,
 * and nothing by 20 s is a 503. A 429 (quota) pauses and tries again inside the same attempt, as Retry-After says or
 * 1.5 s, 3 s, 6 s…, until the deadline.
 */
import {defaultGoogleAuth, type GoogleAuth} from '../ai/google-auth';
import {hedge, HedgeError, type Hedging} from '../ai/resilience';
import type {Line, Synthesis, Synthesizer} from '../domain/speech';
import type {Lang} from '../domain/types';
import {mouthOf, normalise, padTail, parseWav, samplesOf, speechLength, trimLead, wavFile} from './audio';

export const TTS_MODEL = 'gemini-2.5-flash-tts';
/** The narrator's model: the one the TV's clips are recorded with (MODEL in scripts/make-voices.py). */
export const NARRATOR_MODEL = 'gemini-2.5-flash-tts';
export const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
export const SAMPLE_RATE = 24_000;

export const LANGUAGE_CODES: Record<Lang, string> = {en: 'en-US', et: 'et-EE', de: 'de-DE', es: 'es-ES'};

/**
 * Modest: the project's per-minute TTS quota is low (3 calls at once already hit it). No rotation: it would abort an
 * attempt pausing after a 429 and call again at once.
 */
export const TTS_HEDGING: Hedging = {afterMs: 5000, maxInFlight: 2, maxAttempts: 4, deadlineMs: 20_000};

/** An answer from the Text-to-Speech API that wasn't 2xx. */
export class TtsError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Text-to-Speech ${status}: ${body.slice(0, 200)}`);
    this.name = 'TtsError';
  }
}

/** The request body for one line. */
export const ttsRequest = (line: Line, model: string) => ({
  input: {prompt: line.style, text: line.text},
  voice: {languageCode: LANGUAGE_CODES[line.lang], name: line.voice, modelName: model},
  audioConfig: {audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE},
});

/** Waits `ms`, or rejects at once when `signal` aborts (a lost hedge, or the deadline). */
const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(signal.reason);
  }, {once: true});
});

/**
 * How long to wait after a 429: what Google asks (a Retry-After header in seconds, or a google.rpc.RetryInfo
 * retryDelay like "4s" in the error body), else 1.5 s, 3 s, 6 s…; at most 8 s either way.
 */
export function retryAfterMs(headers: Headers, body: string, tries: number): number {
  let asked = Number(headers.get('retry-after'));
  if (!(asked > 0)) asked = Number(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1]);
  return Math.min(8000, asked > 0 ? asked * 1000 : 1500 * 2 ** tries);
}

/**
 * A synthesised line ready for the TV: normalised WAV, its length and the mouth. `likeClips` finishes it as
 * scripts/make-voices.py finishes the TV's recorded clips: the silence before the first word cut to 50 ms, then the
 * loudness, then 300 ms of silence after the last word.
 */
export function finishLine(samples: Int16Array, sampleRate: number, likeClips = false): Synthesis {
  const {samples: loud} = normalise(likeClips ? trimLead(samples, sampleRate) : samples, sampleRate);
  const done = likeClips ? padTail(loud, sampleRate, 300) : loud;
  const ms = (count: number) => Math.round((count / sampleRate) * 1000);
  return {audio: wavFile(done, sampleRate), durationMs: ms(done.length), mouth: mouthOf(done, sampleRate), speechMs: ms(speechLength(samples, sampleRate))};
}

interface VoiceOptions {
  model?: string;
  auth?: GoogleAuth;
  post?: typeof fetch;
  hedging?: Hedging;
  /** Finish lines like the TV's recorded clips (finishLine). */
  likeClips?: boolean;
}

/** The narrator's voice: the model and finish of the TV's recorded clips, whatever TTS_MODEL says. */
export const narratorVoices = (options: Omit<VoiceOptions, 'model' | 'likeClips'> = {}): Synthesizer =>
  geminiVoices({...options, model: NARRATOR_MODEL, likeClips: true});

export function geminiVoices(options: VoiceOptions = {}): Synthesizer {
  const model = options.model ?? TTS_MODEL;
  const post = options.post ?? fetch;
  const hedging = options.hedging ?? TTS_HEDGING;
  return {
    model,
    async synthesize(line: Line, signal?: AbortSignal): Promise<Synthesis> {
      const auth = options.auth ?? defaultGoogleAuth();
      const body = JSON.stringify(ttsRequest(line, model));
      const call = async (attempt: AbortSignal) => {
        for (let tries = 0; ; tries++) {
          const response = await post(TTS_URL, {
            method: 'POST',
            headers: {Authorization: `Bearer ${auth.token()}`, 'x-goog-user-project': auth.project(), 'Content-Type': 'application/json'},
            body,
            signal: attempt,
          });
          const text = await response.text();
          // Over the quota: pause and try again, until a deadline aborts the wait.
          if (response.status === 429) {
            const wait = retryAfterMs(response.headers, text, tries);
            console.warn(`speech (${model}): 429 from Google; trying again in ${(wait / 1000).toFixed(1)} s`);
            await pause(wait, attempt);
            continue;
          }
          if (!response.ok) throw new TtsError(response.status, text);
          const audio = (JSON.parse(text) as {audioContent?: string}).audioContent;
          if (!audio) throw new TtsError(response.status, 'no audioContent');
          return Buffer.from(audio, 'base64');
        }
      };
      let audio: Buffer;
      try {
        const result = await hedge(call, bytes => bytes.length > 0, hedging, signal);
        console.log(`speech (${model}): attempt ${result.winner} of ${result.attempts} answered in ${(result.ms / 1000).toFixed(1)} s`);
        audio = result.value;
      } catch (error) {
        // A sign-in problem says what to do; anything else is just "not now".
        throw error instanceof HedgeError && error.last instanceof Error && error.last.name === 'GoogleAuthError' ? error.last : error;
      }
      // LINEAR16 comes as a WAV (RIFF); bare PCM is read at the asked rate.
      const wav = audio.toString('ascii', 0, 4) === 'RIFF' ? parseWav(audio) : {sampleRate: SAMPLE_RATE, channels: 1, bits: 16, format: 1, pcm: audio};
      if (wav.format !== 1 || wav.bits !== 16 || wav.channels !== 1) throw new TtsError(200, `unexpected audio: format ${wav.format}, ${wav.bits}-bit, ${wav.channels} channels`);
      return finishLine(samplesOf(wav.pcm), wav.sampleRate, options.likeClips);
    },
  };
}

/**
 * A free stand-in voice (TTS_MODEL=fake on the dev server, and tests): a hum shaped like speech, about 60 ms per
 * letter, normalised (and finished `likeClips`) like a real line, so the TV can play lines and move mouths offline.
 */
export function fakeVoices(options: {likeClips?: boolean} = {}): Synthesizer {
  return {
    model: 'fake',
    async synthesize(line: Line): Promise<Synthesis> {
      const speech = Math.round(SAMPLE_RATE * Math.min(10, 0.06 * [...line.text].length));
      const lead = Math.round(0.15 * SAMPLE_RATE);
      const tail = Math.round(0.3 * SAMPLE_RATE);
      // A breath of silence, the hum, a pause at the end (where the mouth closes).
      const samples = Int16Array.from({length: lead + speech + tail}, (_, i) => {
        if (i < lead || i >= lead + speech) return 0;
        const t = (i - lead) / SAMPLE_RATE;
        const syllables = Math.max(0, Math.sin(2 * Math.PI * 4 * t)); // four "syllables" a second
        return Math.round(8000 * syllables * Math.sin(2 * Math.PI * 220 * t));
      });
      return finishLine(samples, SAMPLE_RATE, options.likeClips);
    },
  };
}
