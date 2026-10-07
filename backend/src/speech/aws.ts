/**
 * The speech services as both Lambdas build them: the API, and the worker that goes on with lines a request handed off
 * (domain/speech.ts, continueLine). Gemini voices and listening (Google from AWS isn't built yet: Workload Identity
 * Federation, README; until then every Google call answers 503 saying so), and the S3 cache behind CloudFront signed
 * URLs.
 */
import {notInAwsYet} from '../ai/google-auth';
import {aiModel, DIRECTOR_TIMEOUT_MS} from '../ai/models';
import type {SpeechServices} from '../domain/speech';
import {geminiListenBack, geminiListener, STT_MODEL_ID} from './gemini-listen';
import {geminiVoices, narratorVoices} from './gemini-tts';
import {keyFromSsm, s3SpeechCache} from './s3-cache';

export function awsSpeech(env: (name: string) => string): SpeechServices {
  // Gemini listening: the kid's ideas, and every new line heard back before it is kept.
  const ears = aiModel(process.env.STT_MODEL_ID || STT_MODEL_ID, DIRECTOR_TIMEOUT_MS);
  return {
    synth: geminiVoices({auth: notInAwsYet(), ...(process.env.TTS_MODEL && {model: process.env.TTS_MODEL})}),
    narrator: narratorVoices({auth: notInAwsYet()}),
    cache: s3SpeechCache({
      bucket: env('SPEECH_BUCKET'), cdnUrl: env('SPEECH_CDN_URL'), keyPairId: env('SPEECH_KEY_ID'), privateKey: keyFromSsm(env('SPEECH_KEY_PARAM')),
    }),
    listen: geminiListener(ears),
    listenBack: geminiListenBack(ears),
  };
}
