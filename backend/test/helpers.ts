/**
 * Test harness: the real router and domain, in process, with a clock the test controls. Storage is MemoryRepo, or
 * DynamoRepo on DynamoDB Local when DYNAMODB_ENDPOINT is set (`npm run test:dynamo`), one fresh table per test.
 * Models, Polly and Transcribe are stand-ins: no test calls a real model or AWS service.
 */
import {CreateTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {randomUUID} from 'node:crypto';
import {FakeModel} from '../src/ai/fake';
import type {AiModel, JsonAsk, JsonReply, TextAsk, TextReply} from '../src/ai/model';
import {createApi} from '../src/api';
import {drawCharacter, type DrawingJob, type DrawingReport} from '../src/domain/drawing';
import type {PushResult} from '../src/domain/push';
import {announce, connect} from '../src/domain/realtime';
import type {Repo} from '../src/domain/repo';
import type {Line, LineAudio, ListenBack, SpeechServices, SpokenLine, Synthesis, Synthesizer} from '../src/domain/speech';
import type {Lang} from '../src/domain/types';
import {fakeVoices} from '../src/speech/gemini-tts';
import {matchIcon} from '../src/icons';
import {DynamoRepo} from '../src/repo/dynamo';
import {MemoryRepo} from '../src/repo/memory';
import {type Rasterize, rasterize} from '../src/svg/rasterize';

/** Monday 5 October 2026, 12:00 in Tallinn (UTC+3). */
export const MONDAY_NOON = Date.UTC(2026, 9, 5, 9, 0);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

async function makeRepo(): Promise<Repo> {
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  if (!endpoint) return new MemoryRepo();
  const client = new DynamoDBClient({endpoint, region: 'us-east-1', credentials: {accessKeyId: 'local', secretAccessKey: 'local'}});
  const table = `test-${randomUUID()}`;
  // The same keys and index as the table in infra/stack.ts.
  await client.send(new CreateTableCommand({
    TableName: table,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK'].map(AttributeName => ({AttributeName, AttributeType: 'S'})),
    KeySchema: [{AttributeName: 'PK', KeyType: 'HASH'}, {AttributeName: 'SK', KeyType: 'RANGE'}],
    GlobalSecondaryIndexes: [{
      IndexName: 'GSI1',
      KeySchema: [{AttributeName: 'GSI1PK', KeyType: 'HASH'}, {AttributeName: 'GSI1SK', KeyType: 'RANGE'}],
      Projection: {ProjectionType: 'ALL'},
    }],
  }));
  return new DynamoRepo(table, client);
}

const NO_USAGE = {inputTokens: 0, outputTokens: 0};
export const jsonReply = (value: unknown): JsonReply => ({value, stop: 'done', usage: {inputTokens: 100, outputTokens: 50}});
export const textReply = (text: string, stop: TextReply['stop'] = 'done'): TextReply => ({text, stop, usage: {inputTokens: 200, outputTokens: 3000}});

/**
 * A model that answers from queues (a thrown Error stands for an unreachable model) and records what it was asked;
 * with an empty queue it answers like the free stand-in (a card, the template character, a yes).
 */
export class ScriptedModel implements AiModel {
  readonly id = 'scripted';
  readonly jsonAsks: JsonAsk[] = [];
  readonly textAsks: TextAsk[] = [];
  readonly json$: (JsonReply | Error)[] = [];
  readonly text$: (TextReply | Error)[] = [];
  private readonly fallback = new FakeModel();

  async json(ask: JsonAsk): Promise<JsonReply> {
    this.jsonAsks.push(ask);
    const next = this.json$.shift();
    if (next instanceof Error) throw next;
    return next ?? this.fallback.json(ask);
  }

  async text(ask: TextAsk): Promise<TextReply> {
    this.textAsks.push(ask);
    const next = this.text$.shift();
    if (next instanceof Error) throw next;
    return next ?? this.fallback.text(ask);
  }
}

/**
 * The voices, their cache and the ears, in memory: what was made (by characters, by the narrator), kept, heard from a
 * kid and heard back. Hearing back gives the last line's words unless a test queues what is heard (`heardBack`).
 */
export function fakeSpeech() {
  const made: Line[] = [];
  const narrated: Line[] = [];
  const stored = new Map<string, SpokenLine>();
  const heard: {wav: Buffer; lang: Lang}[] = [];
  const said = {text: 'a dragon who loves pancakes'};
  const heardBack: string[] = [];
  const checked: {wav: Buffer; lang: Lang}[] = [];
  let last = '';
  const voice = fakeVoices();
  const reader = fakeVoices({likeClips: true});
  const synth: Synthesizer = {
    model: 'test-tts',
    async synthesize(line: Line): Promise<Synthesis> {
      made.push(line);
      last = line.text;
      return voice.synthesize(line);
    },
  };
  const narrator: Synthesizer = {
    model: 'test-narrator',
    async synthesize(line: Line): Promise<Synthesis> {
      narrated.push(line);
      last = line.text;
      return reader.synthesize(line);
    },
  };
  const listenBack: ListenBack = async (wav, lang) => {
    checked.push({wav, lang});
    return heardBack.shift() ?? last;
  };
  const services: SpeechServices = {
    synth,
    narrator,
    listenBack,
    cache: {
      get: async (key: string) => stored.get(key),
      async put(key: string, line: LineAudio) {
        const spoken = {audioUrl: `https://speech.test/${key}.wav?Signature=x`, durationMs: line.durationMs, mouth: line.mouth};
        stored.set(key, spoken);
        return spoken;
      },
    },
    async listen(wav: Buffer, lang: Lang) {
      heard.push({wav, lang});
      return said.text;
    },
  };
  return {made, narrated, stored, heard, said, heardBack, checked, services};
}

export async function setup(start = MONDAY_NOON) {
  const repo = await makeRepo();
  const clock = {now: start};
  /** The art director (inside the API request) and the worker's models; tests queue what they answer. */
  const director = new ScriptedModel();
  const artist = new ScriptedModel();
  const checker = new ScriptedModel();
  /** Drawing jobs the API started; a test runs them with `runDrawing` when it wants the result. */
  const drawingJobs: DrawingJob[] = [];
  const startDrawing = async (job: DrawingJob) => {
    drawingJobs.push(job);
  };
  /** Messages sent to realtime connections; connections in `goneConnections` answer as gone (API Gateway: 410). */
  const realtime: {connectionId: string; message: string}[] = [];
  const goneConnections = new Set<string>();
  const sendRealtime = async (connectionId: string, message: string) => {
    if (goneConnections.has(connectionId)) return false;
    realtime.push({connectionId, message});
    return true;
  };
  /** Pushes sent (payload parsed); a test sets what a push service answers per endpoint. */
  const pushes: {endpoint: string; payload: {title: string; body: string; data: {url: string; claimId: string}}}[] = [];
  const pushAnswers = new Map<string, PushResult>();
  const push = {
    publicKey: async () => 'test-vapid-public-key',
    send: async (subscription: {endpoint: string}, payload: string) => {
      if (subscription.endpoint.includes('broken')) throw new Error('the push service is down');
      pushes.push({endpoint: subscription.endpoint, payload: JSON.parse(payload)});
      return pushAnswers.get(subscription.endpoint) ?? 'sent';
    },
  };
  const speech = fakeSpeech();
  const api = createApi({
    repo, now: () => clock.now, pwaUrl: 'https://pwa.test', pickIcon: async title => matchIcon(title), director, startDrawing,
    speech: speech.services, sendRealtime, realtimeUrl: 'wss://realtime.test/dev', push,
  });
  /** Runs (and clears) the started drawing jobs, as the worker would, telling the family's connections. */
  const runDrawing = async (options: {rasterize?: Rasterize} = {}): Promise<DrawingReport[]> => {
    const notify = (familyId: string) => announce(repo, sendRealtime, [familyId], clock.now);
    const reports: DrawingReport[] = [];
    for (const job of drawingJobs.splice(0)) {
      reports.push(await drawCharacter({repo, now: () => clock.now, artist, checker, rasterize: options.rasterize ?? rasterize, notify}, job));
    }
    return reports;
  };
  /** Opens a realtime connection the way $connect does; "jwt-<sub>" is a valid parent token here. Undefined if refused. */
  let connections = 0;
  const openRealtime = async (query: {device?: string; token?: string}) => {
    const id = `conn-${++connections}`;
    const verifyParent = async (token: string) => (token.startsWith('jwt-') ? token.slice(4) : undefined);
    return (await connect(repo, verifyParent, id, query, clock.now)) ? id : undefined;
  };

  const caller = (auth: {parent?: string; authorization?: string}): Caller => {
    const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
      const url = new URL(path, 'http://test');
      const raw = Buffer.isBuffer(body) ? body : undefined;
      const response = await api({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: {...(auth.authorization && {authorization: auth.authorization}), ...headers},
        body: body === undefined || raw ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        ...(raw && {rawBody: raw}),
        ...(auth.parent && {parent: {sub: auth.parent, email: `${auth.parent}@example.com`}}),
      });
      // Through JSON, as on the wire.
      return {status: response.status, headers: response.headers ?? {}, body: response.body === undefined ? undefined : JSON.parse(JSON.stringify(response.body))};
    };
    return {
      get: (path, headers) => send('GET', path, undefined, headers),
      post: (path, body) => send('POST', path, body),
      patch: (path, body) => send('PATCH', path, body),
      delete: (path, body) => send('DELETE', path, body),
    };
  };

  return {
    repo,
    clock,
    director,
    artist,
    checker,
    drawingJobs,
    runDrawing,
    speech,
    realtime,
    goneConnections,
    openRealtime,
    pushes,
    pushAnswers,
    /** A signed-in parent (API Gateway has checked the token; the router gets the claims). */
    parent: (sub: string) => caller({parent: sub}),
    /** A TV with a device token. */
    device: (token: string) => caller({authorization: `Device ${token}`}),
    /** No credentials (the TV before pairing). */
    open: caller({}),
  };
}

export interface Res {
  status: number;
  /** Parsed JSON; the tests check it field by field. */
  body: any;
  headers: Record<string, string>;
}

export interface Caller {
  get(path: string, headers?: Record<string, string>): Promise<Res>;
  /** A Buffer body is sent as raw bytes (audio). */
  post(path: string, body?: unknown): Promise<Res>;
  patch(path: string, body: unknown): Promise<Res>;
  delete(path: string, body?: unknown): Promise<Res>;
}

export type Setup = Awaited<ReturnType<typeof setup>>;

/** Pairs a TV for the parent, the way the TV and the parent app do it. */
export async function pairTv(t: Setup, parent: Caller, name = 'Living room') {
  const {body: pairing} = await t.open.post('/pairings', {platform: 'fireos'});
  await parent.post(`/pairings/${pairing.code}/confirm`, {name});
  const {body} = await t.open.get(`/pairings/${pairing.code}`);
  return {tv: t.device(body.deviceToken), deviceId: body.deviceId as string, token: body.deviceToken as string};
}

/**
 * A family in Tallinn (PIN 1234) with Mia (5: a 60-minute jar, 30 given) and Leo (8: 90, 50 given), their daily jobs
 * "Toys away" (Mia, 10 min) and "Brush teeth" (both, 10 min), and a paired TV.
 */
export async function family(start = MONDAY_NOON) {
  // Set up a second at a time in the minute before `start`, as a parent would (order follows creation time).
  const t = await setup(start - MINUTE);
  const step = async <T>(make: () => Promise<T>) => {
    t.clock.now += 1000;
    return make();
  };
  const mom = t.parent('mom');
  await step(() => mom.post('/family', {name: 'Test family', lang: 'en', timezone: 'Europe/Tallinn', pin: '1234'}));
  const mia = (await step(() => mom.post('/children', {name: 'Mia', avatar: 'bear', color: 'gold', age: 5}))).body;
  const leo = (await step(() => mom.post('/children', {name: 'Leo', avatar: 'bunny', color: 'sky', age: 8}))).body;
  const toys = (await step(() => mom.post('/chores', {title: 'Toys away', minutes: 10, childIds: [mia.id]}))).body;
  const teeth = (await step(() => mom.post('/chores', {title: 'Brush teeth', minutes: 10, childIds: [mia.id, leo.id]}))).body;
  const {tv, deviceId} = await step(() => pairTv(t, mom));
  t.clock.now = start;
  const familyId: string = (await mom.get('/family')).body.family.id;

  /** A kid says "I did it!" on the TV (a fresh claim id unless given). */
  const claim = (childId: string, choreId: string, at = t.clock.now, id: string = randomUUID()) =>
    tv.post('/device/claims', {id, childId, choreId, at});
  const balance = async (childId: string) =>
    (await mom.get('/family')).body.children.find((c: {id: string}) => c.id === childId).balanceSec as number;
  const child = async (childId: string) => (await mom.get('/family')).body.children.find((c: {id: string}) => c.id === childId);
  /** Gives a kid character tokens directly (as full-jar approvals would). */
  const giveTokens = async (childId: string, tokens: number) => {
    const stored = (await t.repo.getChild(familyId, childId))!;
    await t.repo.deleteChild(familyId, childId);
    await t.repo.putChild(familyId, {...stored, characterTokens: tokens});
  };

  return {...t, familyId, mom, tv, deviceId, mia, leo, toys, teeth, claim, balance, child, giveTokens, noUsage: NO_USAGE};
}
