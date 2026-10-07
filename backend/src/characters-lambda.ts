/**
 * The worker Lambda, started by the API with an async invoke:
 * - per new character, the drawing (domain/drawing.ts). It always ends the character as ready or needs_help itself,
 *   so it never asks Lambda for a retry (the stack sets 0 retries); if it is killed (timeout), the API settles the
 *   character as needs_help 15 minutes on (STALE_DRAWING);
 * - per new speech line that its request couldn't finish in 24 s, the rest of its tries (domain/speech.ts,
 *   continueLine), caching the one that passes for the TV's next request. If it is killed, the line's lease runs out
 *   and the next request starts again.
 */
import {aiModel, WORKER_PATIENCE} from './ai/models';
import {patient} from './ai/resilience';
import {drawCharacter, type DrawingJob} from './domain/drawing';
import {announce} from './domain/realtime';
import {continueLine, type SpeechServices, type SpeechWork} from './domain/speech';
import {apiGatewaySender} from './realtime/api-gateway';
import {DynamoRepo} from './repo/dynamo';
import {awsSpeech} from './speech/aws';
import {rasterize} from './svg/rasterize';

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const repo = new DynamoRepo(env('TABLE_NAME'));
const sendRealtime = apiGatewaySender(env('REALTIME_ENDPOINT'));
const model = aiModel(env('MODEL_ID'));
// Each drawing and picture check: 90 s, then once more after a failure.
const artist = patient(model, {...WORKER_PATIENCE, label: 'drawing'});
const checker = patient(model, {...WORKER_PATIENCE, label: 'picture check'});

/** Built for the first line (drawings don't need it). */
let speech: SpeechServices | undefined;

const isSpeech = (event: DrawingJob | SpeechWork): event is SpeechWork => 'kind' in event && event.kind === 'speech';

export async function handler(event: DrawingJob | SpeechWork): Promise<void> {
  if (isSpeech(event)) {
    speech ??= awsSpeech(env);
    const result = await continueLine({repo, now: Date.now, speech}, event.job);
    // Tries and the model; never the words.
    console.log(JSON.stringify({speech: result, model: event.job.model, tries: event.job.tries}));
    return;
  }
  const job = event;
  const report = await drawCharacter({
    repo, now: Date.now, artist, checker, rasterize,
    notify: familyId => announce(repo, sendRealtime, [familyId], Date.now()),
  }, job);
  // Rounds, problems and token counts; nothing about the kid.
  console.log(JSON.stringify({model: model.id, ...report}));
}
