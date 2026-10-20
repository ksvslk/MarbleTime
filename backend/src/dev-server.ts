/**
 * The API on your machine, for the TV and the parent app: `npm run dev [-- --seed]`. Same router as the Lambda,
 * data in memory (gone on restart). Listens on 0.0.0.0 so a TV on the LAN can reach it; CORS is open.
 * Parents sign in with `Authorization: Bearer dev-<name>` (dev server only).
 * Realtime (x-realtime) is on the same port: ws://<host>:<port>/realtime?device=<token> or ?token=dev-<name>.
 * Characters: MODEL_ID (default gemini-3.8-flash on Vertex AI with your gcloud sign-in; "fake" for a free stand-in),
 * drawn in this process. Speech: Gemini voices (TTS_MODEL for the characters, default gemini-2.5-flash-tts; the
 * narrator always on the TV clips' model; "fake" hums for both) and Gemini listening (STT_MODEL_ID, default
 * gemini-3.8-flash; "fake"), with the same gcloud sign-in; lines are cached in SPEECH_DIR and served at
 * /dev/speech/<key>.wav.
 */
import {randomUUID} from 'node:crypto';
import {createServer, type IncomingMessage} from 'node:http';
import {networkInterfaces, tmpdir} from 'node:os';
import {mkdirSync, renameSync, writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import webpush from 'web-push';
import {type WebSocket, WebSocketServer} from 'ws';
import {aiModel, DIRECTOR_TIMEOUT_MS, LOCAL_MODEL_ID, WORKER_PATIENCE} from './ai/models';
import {patient} from './ai/resilience';
import {createApi} from './api';
import {bankFor} from './puzzles/bank';
import {makePuzzleSet, type PuzzleJob} from './puzzles/daily';
import {drawCharacter, type DrawingJob} from './domain/drawing';
import type {PushSender} from './domain/push';
import {announce, connect, disconnect, isPing, PONG, type SendRealtime} from './domain/realtime';
import {MAX_WAV_BYTES} from './domain/speech';
import {pickIcon} from './icons';
import {webPushSender} from './push/web-push';
import {MemoryRepo} from './repo/memory';
import {DEMO_DEVICE_TOKEN, DEMO_PARENT, seedDemo} from './seed';
import {cachedAudio, folderSpeechCache} from './speech/local-cache';
import {geminiListenBack, geminiListener, STT_MODEL_ID} from './speech/gemini-listen';
import {fakeVoices, geminiVoices, NARRATOR_MODEL, narratorVoices, TTS_MODEL} from './speech/gemini-tts';
import {rasterize} from './svg/rasterize';

const port = Number(process.env.PORT ?? 8787);
const pwaUrl = process.env.PWA_URL ?? 'http://192.168.0.100:5173';
const seed = process.argv.includes('--seed');
/** Where the data is kept between runs (DATA_FILE); without it the data is gone when the server stops. */
const dataFile = process.env.DATA_FILE;
const modelId = process.env.MODEL_ID ?? LOCAL_MODEL_ID;
const lan = Object.values(networkInterfaces()).flat().filter(net => net?.family === 'IPv4' && !net.internal).map(net => net!.address);
/** This machine as the TV sees it on the LAN. */
const host = `${lan[0] ?? 'localhost'}:${port}`;
/** What the TV is told to connect to (DeviceState.realtimeUrl). */
const realtimeUrl = process.env.REALTIME_URL ?? `ws://${host}/realtime`;
const speechDir = process.env.SPEECH_DIR ?? join(tmpdir(), 'marbletime-speech');
const ttsModel = process.env.TTS_MODEL ?? TTS_MODEL;
const sttModel = process.env.STT_MODEL_ID ?? STT_MODEL_ID;
/** Bodies bigger than this are refused before they're read whole (audio is at most ~0.5 MB). */
const MAX_BODY = MAX_WAV_BYTES * 4;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, if-none-match',
  'access-control-expose-headers': 'etag',
  'access-control-max-age': '3600',
};

class TooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new TooLarge();
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

/** "Bearer dev-<name>" signs in as parent "dev-<name>". Only here: the Lambda trusts API Gateway's JWT check alone. */
function devParent(authorization: string | undefined) {
  const sub = /^Bearer (dev-[\w-]{1,40})$/.exec(authorization ?? '')?.[1];
  return sub === undefined ? undefined : {sub, email: `${sub.slice(4)}@dev.local`};
}

/**
 * Real Web Push only with VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment; otherwise each push is logged,
 * and a key made for this run lets the parent app subscribe all the same.
 */
function devPush(): PushSender {
  const {VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey} = process.env;
  if (publicKey && privateKey) return webPushSender(async () => ({publicKey, privateKey}), process.env.VAPID_SUBJECT ?? 'mailto:parents@marbletime.example');
  const runKey = webpush.generateVAPIDKeys().publicKey;
  return {
    publicKey: async () => runKey,
    async send(subscription, payload) {
      const {title, body} = JSON.parse(payload) as {title: string; body: string};
      console.log(`push (not sent: no VAPID keys) to ${new URL(subscription.endpoint).host}: ${title} · ${body}`);
      return 'sent';
    },
  };
}

async function main() {
  const repo = new MemoryRepo();
  if (seed) await seedDemo(repo, Date.now());
  if (dataFile) {
    const saved = await readFile(dataFile).catch(() => undefined);
    if (saved) repo.restore(saved);
    // Writes also happen outside requests (a drawing finishing), so the file follows the data, not the requests.
    let last: Buffer = saved ?? Buffer.alloc(0);
    const save = () => {
      const now = repo.snapshot();
      if (now.equals(last)) return;
      mkdirSync(dirname(dataFile), {recursive: true});
      writeFileSync(`${dataFile}.tmp`, now);
      renameSync(`${dataFile}.tmp`, dataFile);
      last = now;
    };
    setInterval(save, 2000).unref();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { save(); process.exit(0); });
  }
  const model = aiModel(modelId);

  // Realtime connections of this process; the domain stores them in the repo like the Lambda does.
  const sockets = new Map<string, WebSocket>();
  const sendRealtime: SendRealtime = async (connectionId, message) => {
    const socket = sockets.get(connectionId);
    if (!socket || socket.readyState !== socket.OPEN) return false;
    socket.send(message);
    return true;
  };

  // The drawing worker runs in this process, in the background, as the Lambda's async invoke would.
  const notify = (familyId: string) => announce(repo, sendRealtime, [familyId], Date.now());
  const startDrawing = async (job: DrawingJob) => {
    const artist = patient(model, {...WORKER_PATIENCE, label: 'drawing'});
    const checker = patient(model, {...WORKER_PATIENCE, label: 'picture check'});
    void drawCharacter({repo, now: Date.now, artist, checker, rasterize, notify}, job).then(report => {
      const rounds = report.rounds.map(r => `${r.kind} ${(r.ms / 1000).toFixed(1)} s${r.problems.length ? ` (${r.problems.length} problems: ${r.problems.join('; ')})` : ''}${r.rejected ? ` (picture check: ${r.rejected})` : ''}${r.moved ? ` (moved onto the floor in code: ${r.moved})` : ''}${r.error ? ` (${r.error})` : ''}`);
      console.log(`character ${report.characterId}: ${report.status} after ${report.rounds.length} round(s)\n  ${rounds.join('\n  ')}`);
    }, error => console.error('drawing failed:', error));
  };
  // Sessions come from the bank alone (puzzles/bank/, written ahead of time and checked), as on AWS, so no model runs
  // while a kid plays. PUZZLE_WRITER=<model> also writes new puzzles for a kid's next session, in the background
  // (puzzles/daily.ts), checked by the solvers; all through this machine's gcloud sign-in.
  const puzzleWriter = process.env.PUZZLE_WRITER ? aiModel(process.env.PUZZLE_WRITER, 120_000) : undefined;
  const puzzleSolvers = (process.env.PUZZLE_SOLVERS ?? 'gemini-3.5-flash,gemini-2.5-flash,gemini-3.8-flash').split(',').map(id => aiModel(id.trim(), 60_000));
  const startPuzzles = puzzleWriter && (async (job: PuzzleJob) => {
    void makePuzzleSet({repo, now: Date.now, writer: puzzleWriter, solvers: puzzleSolvers, bank: bankFor}, job).then(report => {
      const dropped = report.dropped.length ? `; dropped ${report.dropped.length} (${[...new Set(report.dropped.map(d => d.why.split(':')[0]))].join(', ')})` : '';
      console.log(`puzzles for a kid: ${report.status}, ${report.written} written, ${report.fromBank} from the bank${dropped}${report.error ? ` (${report.error})` : ''}`);
    });
  });
  const ears = aiModel(sttModel, DIRECTOR_TIMEOUT_MS);
  const api = createApi({
    repo, now: Date.now, pwaUrl, pickIcon, director: aiModel(modelId, DIRECTOR_TIMEOUT_MS), startDrawing,
    speech: {
      synth: ttsModel === 'fake' ? fakeVoices() : geminiVoices({model: ttsModel}),
      narrator: ttsModel === 'fake' ? fakeVoices({likeClips: true}) : narratorVoices(),
      cache: folderSpeechCache(speechDir, `http://${host}/dev/speech`),
      listen: geminiListener(ears),
      // A hum has no words to hear back, and fake ears hear none.
      ...(ttsModel !== 'fake' && sttModel !== 'fake' && {listenBack: geminiListenBack(ears)}),
    },
    sendRealtime, realtimeUrl, push: devPush(), ...(startPuzzles && {startPuzzles}),
  });

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    // The cached lines' audio (in AWS: CloudFront); not part of the API.
    const audioKey = req.method === 'GET' ? /^\/dev\/speech\/(\w+)\.wav$/.exec(url.pathname)?.[1] : undefined;
    if (audioKey) {
      const audio = await cachedAudio(speechDir, audioKey);
      res.writeHead(audio ? 200 : 404, {...CORS, 'content-type': 'audio/wav', 'cache-control': 'public, max-age=86400'}).end(audio);
      return;
    }
    // The local certificate authority (mkcert's), for a phone to install once: until it does, its browser shows the
    // parent app but refuses the notification worker. Public by nature (it is a certificate, not a key).
    if (req.method === 'GET' && url.pathname === '/dev/ca.crt') {
      const ca = process.env.DEV_CA_FILE ? await readFile(process.env.DEV_CA_FILE).catch(() => undefined) : undefined;
      res.writeHead(ca ? 200 : 404, {...CORS, 'content-type': 'application/x-x509-ca-cert', 'content-disposition': 'attachment; filename="marbletime-dev-ca.crt"'}).end(ca);
      return;
    }
    // What went wrong on a phone, said by the parent app's dev build: the phone's own console is out of reach.
    if (req.method === 'POST' && url.pathname === '/dev/log') {
      const text = ((await readBody(req).catch(() => undefined)) ?? Buffer.alloc(0)).toString('utf8').slice(0, 2000);
      console.log(`phone: ${text.replace(/\s+/g, ' ')}`);
      res.writeHead(204, CORS).end();
      return;
    }
    let rawBody: Buffer | undefined;
    try {
      rawBody = await readBody(req);
    } catch (error) {
      if (!(error instanceof TooLarge)) throw error;
      res.writeHead(413, {...CORS, 'content-type': 'application/json'}).end(JSON.stringify({error: {code: 'too_large', message: 'The body is too large'}}));
      return;
    }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]));
    const response = await api({
      method: req.method ?? 'GET',
      path: url.pathname,
      headers,
      query: Object.fromEntries(url.searchParams),
      body: rawBody?.toString('utf8'),
      rawBody,
      parent: devParent(req.headers.authorization),
    });
    res.writeHead(response.status, {...CORS, ...response.headers}).end(response.body === undefined ? undefined : JSON.stringify(response.body));
    // The TV polls every few seconds; unchanged state (304) isn't worth a line.
    if (response.status !== 304) console.log(`${req.method} ${url.pathname}${url.search} → ${response.status} (${Date.now() - started} ms)`);
  });

  // Like API Gateway's $connect: who it is is checked before the WebSocket opens; a refusal is a 401.
  const realtime = new WebSocketServer({noServer: true});
  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = randomUUID();
    const query = {device: url.searchParams.get('device') ?? undefined, token: url.searchParams.get('token') ?? undefined};
    const devVerify = async (token: string) => devParent(`Bearer ${token}`)?.sub;
    if (url.pathname !== '/realtime' || !(await connect(repo, devVerify, id, query, Date.now()))) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    realtime.handleUpgrade(req, socket, head, ws => {
      sockets.set(id, ws);
      console.log(`realtime: ${query.device ? 'a TV' : 'a parent'} connected`);
      ws.on('message', data => {
        if (isPing(data.toString())) ws.send(PONG);
      });
      ws.on('close', () => {
        sockets.delete(id);
        void disconnect(repo, id);
      });
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`MarbleTime dev API (data ${dataFile ? `kept in ${dataFile}` : 'in memory'}):`);
    for (const address of ['localhost', ...lan]) console.log(`  http://${address}:${port}`);
    console.log(`Realtime: ${realtimeUrl}?device=<token> or ?token=dev-<name> (set REALTIME_URL to change what the TV is told)`);
    console.log(`Pairing links: ${pwaUrl}/pair/<code> (set PWA_URL to change)`);
    console.log('Parents sign in with: Authorization: Bearer dev-<name>');
    console.log(`Characters: ${modelId}${modelId === 'fake' ? ' (free stand-in)' : ''} (set MODEL_ID to change; "fake" needs no sign-in)`);
    console.log(`Puzzles: ${puzzleWriter ? `the bank, and new ones from ${process.env.PUZZLE_WRITER}` : 'the bank (set PUZZLE_WRITER to also write new ones)'}`);
    console.log(`Speech: characters ${ttsModel}, narrator ${ttsModel === 'fake' ? 'fake' : NARRATOR_MODEL}, listening ${sttModel}${ttsModel === 'fake' || sttModel === 'fake' ? ' (new lines not heard back)' : ''} (Google, with this machine's gcloud sign-in); lines cached in ${speechDir}`);
    if (seed) console.log(`Seeded: parent "Bearer ${DEMO_PARENT}" (Mia, Leo, PIN 1234) and a paired TV, "Authorization: Device ${DEMO_DEVICE_TOKEN}"`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
