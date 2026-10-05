/**
 * Test harness: the real router and domain, in process, with a clock the test controls. Storage is MemoryRepo, or
 * DynamoRepo on DynamoDB Local when DYNAMODB_ENDPOINT is set (`npm run test:dynamo`), one fresh table per test.
 */
import {CreateTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {randomUUID} from 'node:crypto';
import {createApi} from '../src/api';
import type {Repo} from '../src/domain/repo';
import {matchIcon} from '../src/icons';
import {DynamoRepo} from '../src/repo/dynamo';
import {MemoryRepo} from '../src/repo/memory';

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

export interface Res {
  status: number;
  /** Parsed JSON; the tests check it field by field. */
  body: any;
  headers: Record<string, string>;
}

export interface Caller {
  get(path: string, headers?: Record<string, string>): Promise<Res>;
  post(path: string, body?: unknown): Promise<Res>;
  patch(path: string, body: unknown): Promise<Res>;
  delete(path: string): Promise<Res>;
}

export async function setup(start = MONDAY_NOON) {
  const repo = await makeRepo();
  const clock = {now: start};
  const api = createApi({repo, now: () => clock.now, pwaUrl: 'https://pwa.test', pickIcon: async title => matchIcon(title)});

  const caller = (auth: {parent?: string; authorization?: string}): Caller => {
    const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
      const url = new URL(path, 'http://test');
      const response = await api({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: {...(auth.authorization && {authorization: auth.authorization}), ...headers},
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        ...(auth.parent && {parent: {sub: auth.parent, email: `${auth.parent}@example.com`}}),
      });
      // Through JSON, as on the wire.
      return {status: response.status, headers: response.headers ?? {}, body: response.body === undefined ? undefined : JSON.parse(JSON.stringify(response.body))};
    };
    return {
      get: (path, headers) => send('GET', path, undefined, headers),
      post: (path, body) => send('POST', path, body),
      patch: (path, body) => send('PATCH', path, body),
      delete: path => send('DELETE', path),
    };
  };

  return {
    repo,
    clock,
    /** A signed-in parent (API Gateway has checked the token; the router gets the claims). */
    parent: (sub: string) => caller({parent: sub}),
    /** A TV with a device token. */
    device: (token: string) => caller({authorization: `Device ${token}`}),
    /** No credentials (the TV before pairing). */
    open: caller({}),
  };
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
 * A family in Tallinn (PIN 1234) with Mia (5) and Leo (8), their daily jobs "Toys away" (Mia, 10 min) and
 * "Brush teeth" (both, 5 min), and a paired TV.
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
  const teeth = (await step(() => mom.post('/chores', {title: 'Brush teeth', minutes: 5, childIds: [mia.id, leo.id]}))).body;
  const {tv, deviceId} = await step(() => pairTv(t, mom));
  t.clock.now = start;

  /** A kid says "I did it!" on the TV (a fresh claim id unless given). */
  const claim = (childId: string, choreId: string, at = t.clock.now, id: string = randomUUID()) =>
    tv.post('/device/claims', {id, childId, choreId, at});
  const balance = async (childId: string) =>
    (await mom.get('/family')).body.children.find((c: {id: string}) => c.id === childId).balanceSec as number;

  return {...t, mom, tv, deviceId, mia, leo, toys, teeth, claim, balance};
}
