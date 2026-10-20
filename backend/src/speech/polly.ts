/**
 * The voices on AWS: Amazon Polly, in English, German and Spanish. Polly has no Estonian voice, so an Estonian line is
 * a 503 at once and the TV stays silent for it (its recorded clips still play). A character keeps its Gemini voice
 * name; here it is read as a Polly voice of the same kind: the young ones as Polly's child voices (neural), the others
 * as generative ones. The narrator is one warm voice per language.
 *
 * Polly reads the text as written and has no speaking style, so `style` isn't used and no line needs hearing back.
 * Its PCM comes at 16 kHz at most: it is resampled to the 24 kHz of every other line, then normalised and given its
 * mouth like a Gemini line (finishLine).
 */
import {type Engine, PollyClient, SynthesizeSpeechCommand, type VoiceId} from '@aws-sdk/client-polly';
import type {Line, Synthesis, Synthesizer} from '../domain/speech';
import type {Lang, Voice} from '../domain/types';
import {samplesOf} from './audio';
import {finishLine, LANGUAGE_CODES, SAMPLE_RATE} from './gemini-tts';

/** The voice model in the cache key: another provider makes new audio. */
export const POLLY_MODEL = 'polly';
/** The highest rate Polly gives PCM at. */
export const POLLY_RATE = 16_000;

export interface PollyVoice {
  id: VoiceId;
  engine: Engine;
}
// Plain names: Polly lists newer voices (Kenneth, Tina) before the SDK's VoiceId type knows them.
const generative = (id: string): PollyVoice => ({id: id as VoiceId, engine: 'generative'});
const neural = (id: string): PollyVoice => ({id: id as VoiceId, engine: 'neural'});

type Spoken = Exclude<Lang, 'et'>;

/** Each Gemini voice as the Polly voice that reads it, per language (Gemini's own words for them in the comments). */
export const CHARACTER_VOICES: Record<Spoken, Record<Voice, PollyVoice>> = {
  en: {
    Puck: neural('Justin'), // upbeat
    Fenrir: neural('Kevin'), // excitable
    Leda: neural('Ivy'), // youthful
    Zephyr: generative('Tiffany'), // bright
    Aoede: generative('Ruth'), // breezy
    Laomedeia: generative('Salli'), // upbeat
    Achird: generative('Matthew'), // friendly
    Sadachbia: generative('Stephen'), // lively
    Autonoe: generative('Joanna'), // bright
    Algenib: generative('Kenneth'), // gravelly
    Achernar: generative('Danielle'), // soft
    Vindemiatrix: generative('Danielle'), // gentle
  },
  de: {
    Puck: generative('Daniel'), Fenrir: generative('Lennart'), Leda: generative('Vicki'), Zephyr: generative('Tina'),
    Aoede: generative('Vicki'), Laomedeia: generative('Tina'), Achird: generative('Daniel'), Sadachbia: generative('Lennart'),
    Autonoe: generative('Tina'), Algenib: generative('Daniel'), Achernar: generative('Vicki'), Vindemiatrix: generative('Vicki'),
  },
  es: {
    Puck: generative('Sergio'), Fenrir: generative('Sergio'), Leda: generative('Lucia'), Zephyr: generative('Lucia'),
    Aoede: generative('Lucia'), Laomedeia: generative('Lucia'), Achird: generative('Sergio'), Sadachbia: generative('Sergio'),
    Autonoe: generative('Lucia'), Algenib: generative('Sergio'), Achernar: generative('Lucia'), Vindemiatrix: generative('Lucia'),
  },
};

/** The narrator: warm, clear, grown-up. */
export const NARRATOR_VOICES: Record<Spoken, PollyVoice> = {en: generative('Ruth'), de: generative('Vicki'), es: generative('Lucia')};

/** A language this server has no voice for: the line is a 503 at once (domain/speech.ts), not six tries. */
export class NoVoiceError extends Error {
  constructor(lang: Lang) {
    super(`This server has no voice for ${lang} lines; the TV stays silent for them`);
    this.name = 'NoVoiceError';
  }
}

/** 16-bit samples at another rate, by straight lines between neighbours (speech, going up: no filter needed). */
export function resample(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return samples;
  const out = new Int16Array(Math.round((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const a = samples[Math.min(j, samples.length - 1)] ?? 0;
    const b = samples[Math.min(j + 1, samples.length - 1)] ?? a;
    out[i] = Math.round(a + (b - a) * (x - j));
  }
  return out;
}

interface PollyOptions {
  /** The narrator's voice, finished like the TV's recorded clips. */
  narrator?: boolean;
  client?: Pick<PollyClient, 'send'>;
}

export function pollyVoices(options: PollyOptions = {}): Synthesizer {
  const client = options.client ?? new PollyClient({});
  return {
    model: POLLY_MODEL,
    async synthesize(line: Line, signal?: AbortSignal): Promise<Synthesis> {
      if (line.lang === 'et') throw new NoVoiceError(line.lang);
      const voice = options.narrator ? NARRATOR_VOICES[line.lang] : CHARACTER_VOICES[line.lang][line.voice];
      const answer = await client.send(
        new SynthesizeSpeechCommand({
          Engine: voice.engine, VoiceId: voice.id, LanguageCode: LANGUAGE_CODES[line.lang] as never,
          OutputFormat: 'pcm', SampleRate: String(POLLY_RATE), TextType: 'text', Text: line.text,
        }),
        {abortSignal: signal},
      );
      const pcm = await answer.AudioStream?.transformToByteArray();
      if (!pcm?.length) throw new Error(`Polly gave no audio (${voice.id})`);
      // Polly's PCM: signed 16-bit little-endian, mono.
      const samples = samplesOf(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
      return finishLine(resample(samples, POLLY_RATE, SAMPLE_RATE), SAMPLE_RATE, options.narrator);
    },
  };
}
