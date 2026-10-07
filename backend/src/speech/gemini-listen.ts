/**
 * Gemini listening (STT_MODEL_ID, default gemini-3.8-flash), in the family's language, the WAV inline (audio/wav):
 * - the kid's spoken idea → text: strict JSON {text}, an exact transcript, words in another language kept as said,
 *   nothing added, "" when nothing was said;
 * - a made line heard back before it is kept (domain/line-check.ts), asked as scripts/make-voices.py asks for the
 *   TV's clips.
 * Hedged like the art director (src/ai/resilience.ts): another attempt when none has answered for a few seconds.
 * Neither the audio nor the words are stored or logged: only attempt counts and timings.
 */
import type {AiModel, JsonReply, JsonSchema} from '../ai/model';
import {hedge, HedgeError, type Hedging} from '../ai/resilience';
import type {ListenBack} from '../domain/speech';
import {type Lang, LANGUAGE_NAMES} from '../domain/types';
import {parseWav, samplesOf, surround, wavFile} from './audio';

export const STT_MODEL_ID = 'gemini-3.8-flash';
export const LISTEN_HEDGING: Hedging = {afterMs: 4000, maxInFlight: 3, maxAttempts: 6, deadlineMs: 20_000, rotate: true};

export const LISTEN_SYSTEM = 'You transcribe short recordings of children telling a parent their idea for a cartoon character.';

export const listenPrompt = (lang: Lang) => `Write down exactly what is said in this recording. The family speaks ${LANGUAGE_NAMES[lang]}.
- Write the words as said, in ${LANGUAGE_NAMES[lang]}; keep any words in another language as they were said (for example a name or an English word).
- Add nothing, fix nothing, translate nothing; no notes about noise, music or who is speaking.
- If nothing is said, or only noise, "text" is "".`;

export const TRANSCRIPT_SCHEMA: JsonSchema = {type: 'object', properties: {text: {type: 'string'}}, required: ['text'], additionalProperties: false};

const transcript = (reply: JsonReply) =>
  reply.stop === 'done' && typeof (reply.value as {text?: unknown} | undefined)?.text === 'string';

/** Listens to a 16 kHz mono 16-bit WAV. */
export function geminiListener(model: AiModel, hedging: Hedging = LISTEN_HEDGING): (wav: Buffer, lang: Lang) => Promise<string> {
  return async (wav, lang) => {
    const ask = {system: LISTEN_SYSTEM, user: listenPrompt(lang), schema: TRANSCRIPT_SCHEMA, name: 'transcript', audio: [wav], maxTokens: 1024};
    try {
      const result = await hedge(signal => model.json({...ask, signal}), transcript, hedging);
      console.log(`listening (${model.id}): attempt ${result.winner} of ${result.attempts} answered in ${(result.ms / 1000).toFixed(1)} s`);
      return (result.value.value as {text: string}).text;
    } catch (error) {
      throw error instanceof HedgeError && error.last instanceof Error && error.last.name === 'GoogleAuthError' ? error.last : error;
    }
  };
}

/**
 * Hearing a made line back: what scripts/make-voices.py asks about each recorded clip. Numbers come back as digits,
 * as the TV writes them ("30 minutit" heard as "kolmkümmend minutit" would not match).
 */
export const listenBackPrompt = (lang: Lang) =>
  `Write exactly what is said in this ${LANGUAGE_NAMES[lang]} audio, as ${LANGUAGE_NAMES[lang]} text. Write numbers as digits. Only the words, nothing else.`;

/**
 * Like listening to the kid (a line heard back took 2.4–3.8 s live, Oct 2026), with a shorter deadline: the TV is
 * waiting, and the request's own deadline (24 s, every try included) rules anyway.
 */
export const LISTEN_BACK_HEDGING: Hedging = {afterMs: 4000, maxInFlight: 3, maxAttempts: 6, deadlineMs: 15_000, rotate: true};

/**
 * A line as it is heard back: with half a second of silence on each side (on very short clips the listener made up
 * whole sentences), as scripts/make-voices.py pads the clips it checks.
 */
export function padForListening(wav: Buffer): Buffer {
  const {sampleRate, channels, bits, format, pcm} = parseWav(wav);
  if (format !== 1 || bits !== 16 || channels !== 1) return wav;
  return wavFile(surround(samplesOf(pcm), sampleRate, 500), sampleRate);
}

/** Hears a made line (a 16-bit mono WAV) back: the words only, as plain text. */
export function geminiListenBack(model: AiModel, hedging: Hedging = LISTEN_BACK_HEDGING): ListenBack {
  return async (wav, lang, signal) => {
    const ask = {user: listenBackPrompt(lang), audio: [padForListening(wav)], maxTokens: 1024};
    try {
      const result = await hedge(attempt => model.text({...ask, signal: attempt}), reply => reply.stop === 'done', hedging, signal);
      console.log(`listening back (${model.id}): attempt ${result.winner} of ${result.attempts} answered in ${(result.ms / 1000).toFixed(1)} s`);
      return result.value.text.trim();
    } catch (error) {
      throw error instanceof HedgeError && error.last instanceof Error && error.last.name === 'GoogleAuthError' ? error.last : error;
    }
  };
}
