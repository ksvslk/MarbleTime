/**
 * The speech services as both Lambdas build them: the API, and the worker that goes on with lines a request handed off
 * (domain/speech.ts, continueLine), with the S3 cache behind CloudFront signed URLs.
 *
 * SPEECH_PROVIDER (the stack sets it):
 * - `polly` (the default): Amazon Polly's voices in English, German and Spanish (polly.ts). Polly reads the text as
 *   written, so lines aren't heard back. No listening: typing is how a kid's idea comes in (docs/08, Oct 19).
 * - `google`: Gemini voices and listening. Google from AWS isn't built yet (Workload Identity Federation, README), so
 *   every Google call answers 503 saying so.
 */
import {notInAwsYet} from '../ai/google-auth';
import {aiModel, DIRECTOR_TIMEOUT_MS} from '../ai/models';
import type {SpeechServices} from '../domain/speech';
import {ApiError} from '../domain/errors';
import {geminiListenBack, geminiListener, STT_MODEL_ID} from './gemini-listen';
import {geminiVoices, narratorVoices} from './gemini-tts';
import {pollyVoices} from './polly';
import {keyFromSsm, s3SpeechCache} from './s3-cache';

export function awsSpeech(env: (name: string) => string): SpeechServices {
  const cache = s3SpeechCache({
    bucket: env('SPEECH_BUCKET'), cdnUrl: env('SPEECH_CDN_URL'), keyPairId: env('SPEECH_KEY_ID'), privateKey: keyFromSsm(env('SPEECH_KEY_PARAM')),
  });
  if ((process.env.SPEECH_PROVIDER || 'polly') === 'polly') {
    return {
      synth: pollyVoices(),
      narrator: pollyVoices({narrator: true}),
      cache,
      listen: () => Promise.reject(new ApiError(503, 'unavailable', "Listening isn't available on this server; type the words instead")),
    };
  }
  // Gemini listening: the kid's ideas, and every new line heard back before it is kept.
  const ears = aiModel(process.env.STT_MODEL_ID || STT_MODEL_ID, DIRECTOR_TIMEOUT_MS);
  return {
    synth: geminiVoices({auth: notInAwsYet(), ...(process.env.TTS_MODEL && {model: process.env.TTS_MODEL})}),
    narrator: narratorVoices({auth: notInAwsYet()}),
    cache,
    listen: geminiListener(ears),
    listenBack: geminiListenBack(ears),
  };
}
