/** The one Lambda behind API Gateway (HTTP API, payload format 2.0). */
import {InvokeCommand, LambdaClient} from '@aws-sdk/client-lambda';
import {aiModel, DIRECTOR_TIMEOUT_MS} from './ai/models';
import {createApi} from './api';
import type {DrawingJob} from './domain/drawing';
import type {SpeechWork} from './domain/speech';
import {type HttpApiEvent, toRequest, toResult} from './http/api-gateway';
import {pickIcon} from './icons';
import {vapidFromSsm, webPushSender} from './push/web-push';
import {apiGatewaySender} from './realtime/api-gateway';
import {DynamoRepo} from './repo/dynamo';
import {awsSpeech} from './speech/aws';

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const lambda = new LambdaClient({});

/** Hands a new character to the drawing worker and returns at once (an async "Event" invoke). */
async function startDrawing(job: DrawingJob) {
  await lambda.send(new InvokeCommand({FunctionName: env('DRAWING_FUNCTION'), InvocationType: 'Event', Payload: Buffer.from(JSON.stringify(job))}));
}

/**
 * Hands a new line its request couldn't finish in 24 s to the worker (an async invoke), which goes on with its tries:
 * nothing in a Lambda outlives its response.
 */
async function handOffLine(job: SpeechWork['job']) {
  const work: SpeechWork = {kind: 'speech', job};
  await lambda.send(new InvokeCommand({FunctionName: env('DRAWING_FUNCTION'), InvocationType: 'Event', Payload: Buffer.from(JSON.stringify(work))}));
}

const api = createApi({
  repo: new DynamoRepo(env('TABLE_NAME')),
  now: Date.now,
  pwaUrl: env('PWA_URL'),
  pickIcon,
  director: aiModel(env('MODEL_ID'), DIRECTOR_TIMEOUT_MS),
  startDrawing,
  // Gemini voices and listening: Google from AWS isn't built yet (Workload Identity Federation, README), so these answer
  // 503 saying so; deploys refuse to start without the Google setup (infra/app.ts).
  speech: {...awsSpeech(env), handOff: handOffLine},
  sendRealtime: apiGatewaySender(env('REALTIME_ENDPOINT')),
  realtimeUrl: env('REALTIME_URL'),
  // Push services want to know who sends: the parent app's address.
  push: webPushSender(vapidFromSsm(env('VAPID_PUBLIC_PARAM'), env('VAPID_PRIVATE_PARAM')), env('PWA_URL')),
});

export async function handler(event: HttpApiEvent) {
  return toResult(await api(toRequest(event)));
}
