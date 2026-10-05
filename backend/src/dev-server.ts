/**
 * The API on your machine, for the TV and the parent app: `npm run dev [-- --seed]`. Same router as the Lambda,
 * data in memory (gone on restart). Listens on 0.0.0.0 so a TV on the LAN can reach it; CORS is open.
 * Parents sign in with `Authorization: Bearer dev-<name>` (dev server only).
 */
import {createServer, type IncomingMessage} from 'node:http';
import {networkInterfaces} from 'node:os';
import {createApi} from './api';
import {pickIcon} from './icons';
import {MemoryRepo} from './repo/memory';
import {DEMO_DEVICE_TOKEN, DEMO_PARENT, seedDemo} from './seed';

const port = Number(process.env.PORT ?? 8787);
const pwaUrl = process.env.PWA_URL ?? 'http://192.168.0.100:5173';
const seed = process.argv.includes('--seed');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, if-none-match',
  'access-control-expose-headers': 'etag',
  'access-control-max-age': '3600',
};

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
}

/** "Bearer dev-<name>" signs in as parent "dev-<name>". Only here: the Lambda trusts API Gateway's JWT check alone. */
function devParent(authorization: string | undefined) {
  const sub = /^Bearer (dev-[\w-]{1,40})$/.exec(authorization ?? '')?.[1];
  return sub === undefined ? undefined : {sub, email: `${sub.slice(4)}@dev.local`};
}

async function main() {
  const repo = new MemoryRepo();
  if (seed) await seedDemo(repo, Date.now());
  const api = createApi({repo, now: Date.now, pwaUrl, pickIcon});

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]));
    const response = await api({
      method: req.method ?? 'GET',
      path: url.pathname,
      headers,
      query: Object.fromEntries(url.searchParams),
      body: await readBody(req),
      parent: devParent(req.headers.authorization),
    });
    res.writeHead(response.status, {...CORS, ...response.headers}).end(response.body === undefined ? undefined : JSON.stringify(response.body));
    // The TV polls every few seconds; unchanged state (304) isn't worth a line.
    if (response.status !== 304) console.log(`${req.method} ${url.pathname}${url.search} → ${response.status} (${Date.now() - started} ms)`);
  });

  server.listen(port, '0.0.0.0', () => {
    const lan = Object.values(networkInterfaces()).flat().filter(net => net?.family === 'IPv4' && !net.internal).map(net => net!.address);
    console.log('MarbleTime dev API (data in memory):');
    for (const host of ['localhost', ...lan]) console.log(`  http://${host}:${port}`);
    console.log(`Pairing links: ${pwaUrl}/pair/<code> (set PWA_URL to change)`);
    console.log('Parents sign in with: Authorization: Bearer dev-<name>');
    if (seed) console.log(`Seeded: parent "Bearer ${DEMO_PARENT}" (Mia, Leo, PIN 1234) and a paired TV, "Authorization: Device ${DEMO_DEVICE_TOKEN}"`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
