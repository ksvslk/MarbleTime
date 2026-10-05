/**
 * DynamoDB storage: one table (docs/03 §7), on-demand. Every write that touches more than one item is one
 * transaction, and client UUIDs are keys or conditional puts, so a retried request changes nothing twice.
 *
 *   PK            SK                              what
 *   FAM#<f>       META                            family
 *   FAM#<f>       PARENT#<sub>                    parent
 *   USER#<sub>    FAM#<f>                         a parent's family
 *   FAM#<f>       CHILD#<c>                       child (balance, penalty debt, today's game marbles)
 *   FAM#<f>       CHORE#<k>                       job
 *   FAM#<f>       CLAIM#<id>                      claim (id = the TV's UUID)
 *   FAM#<f>       SLOT#<c>#<k>#<day|once>         the claim holding a job's day ("at most once per day")
 *   FAM#<f>       LEDGER#<c>#<createdAt>#<id>     ledger entry (time-ordered per child)
 *   FAM#<f>       REF#<c>#<client id>             what an adjust or game result produced (repeats get it back)
 *   FAM#<f>       DEV#<d>                         TV
 *   PAIR#<code>   META                            pairing
 *
 * GSI1 (all attributes): GSI1PK TOKEN#<sha256 of the device token> / GSI1SK DEV finds a TV by its token;
 * GSI1PK CLAIMS#<f> / GSI1SK W#<createdAt>#<id> (waiting) or D#<decidedAt>#<id> (decided) lists claims;
 * GSI1PK ADJ#<f> / GSI1SK <createdAt>#<id> lists bonuses and taken-away minutes (BONUS and PENALTY entries).
 * TTL attribute `ttl` (seconds): pairings (a day after expiry), day slots (3 days), refs (30 days).
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, type QueryCommandInput,
  TransactWriteCommand, type TransactWriteCommandInput, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {ChildProfile, Decision, GameCredit, Repo} from '../domain/repo';
import {DAY} from '../domain/time';
import type {Chore, Child, Claim, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, Ref} from '../domain/types';

type Item = Record<string, unknown>;
type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

const pad = (time: number) => String(time).padStart(13, '0');
const seconds = (time: number) => Math.floor(time / 1000);
const fam = (familyId: string) => `FAM#${familyId}`;
const key = (PK: string, SK: string) => ({PK, SK});
const childKey = (familyId: string, childId: string) => key(fam(familyId), `CHILD#${childId}`);
const choreKey = (familyId: string, choreId: string) => key(fam(familyId), `CHORE#${choreId}`);
const claimKey = (familyId: string, claimId: string) => key(fam(familyId), `CLAIM#${claimId}`);
const slotKey = (familyId: string, c: Claim) => key(fam(familyId), `SLOT#${c.childId}#${c.choreId}#${c.slot}`);
const entryKey = (familyId: string, e: LedgerEntry) => key(fam(familyId), `LEDGER#${e.childId}#${pad(e.createdAt)}#${e.id}`);
const refKey = (familyId: string, childId: string, id: string) => key(fam(familyId), `REF#${childId}#${id}`);
const deviceKey = (familyId: string, deviceId: string) => key(fam(familyId), `DEV#${deviceId}`);
const pairingKey = (code: string) => key(`PAIR#${code}`, 'META');
const claimIndexKey = (c: Claim) => (c.status === 'waiting' ? `W#${pad(c.createdAt)}#${c.id}` : `D#${pad(c.decidedAt ?? 0)}#${c.id}`);
/** Bonuses and taken-away minutes are also listed per family, for the TV's state. */
const adjustmentIndex = (familyId: string, e: LedgerEntry) =>
  (e.type === 'BONUS' || e.type === 'PENALTY' ? {GSI1PK: `ADJ#${familyId}`, GSI1SK: `${pad(e.createdAt)}#${e.id}`} : {});

const KEY_ATTRIBUTES = new Set(['PK', 'SK', 'GSI1PK', 'GSI1SK', 'ttl']);
/** The stored record without its storage keys. */
const record = <T>(item: Item) => Object.fromEntries(Object.entries(item).filter(([name]) => !KEY_ATTRIBUTES.has(name))) as T;

const isNamed = (error: unknown, name: string): error is Error & Item => error instanceof Error && error.name === name;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class DynamoRepo implements Repo {
  private readonly db: DynamoDBDocumentClient;

  constructor(private readonly table: string, client = new DynamoDBClient({})) {
    this.db = DynamoDBDocumentClient.from(client, {marshallOptions: {removeUndefinedValues: true}});
  }

  // ---------- helpers ----------

  private async get<T>(Key: Item): Promise<T | undefined> {
    const {Item} = await this.db.send(new GetCommand({TableName: this.table, Key, ConsistentRead: true}));
    return Item && record<T>(Item);
  }

  /** All pages (or the first `limit` items) of a query: strongly consistent on the table, eventually on GSI1. */
  private async queryItems(input: Omit<QueryCommandInput, 'TableName'>, limit = Infinity): Promise<Item[]> {
    const items: Item[] = [];
    let start: Item | undefined;
    do {
      const page = await this.db.send(new QueryCommand({
        TableName: this.table, ConsistentRead: input.IndexName === undefined, ...input, ExclusiveStartKey: start,
      }));
      items.push(...(page.Items ?? []));
      start = page.LastEvaluatedKey;
    } while (start && items.length < limit);
    return items.slice(0, limit);
  }

  /** A family's items whose sort key starts with `prefix`, optionally filtered. */
  private async family<T>(familyId: string, prefix: string, filter?: {expression: string; values: Item}): Promise<T[]> {
    const items = await this.queryItems({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ...(filter && {FilterExpression: filter.expression}),
      ExpressionAttributeValues: {':pk': fam(familyId), ':prefix': prefix, ...filter?.values},
    });
    return items.map(item => record<T>(item));
  }

  private async keysWithPrefix(familyId: string, prefix: string, filter?: {expression: string; values: Item}): Promise<Item[]> {
    const items = await this.queryItems({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ProjectionExpression: 'PK, SK',
      ...(filter && {FilterExpression: filter.expression}),
      ExpressionAttributeValues: {':pk': fam(familyId), ':prefix': prefix, ...filter?.values},
    });
    return items.map(({PK, SK}) => ({PK, SK}));
  }

  /** A write with a condition: false when the condition fails. */
  private async conditional(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch (error) {
      if (isNamed(error, 'ConditionalCheckFailedException')) return false;
      throw error;
    }
  }

  /** Sets the given fields on an existing item and returns it; undefined if the item doesn't exist. */
  private async update<T>(Key: Item, fields: Item): Promise<T | undefined> {
    const names = Object.keys(fields).filter(name => fields[name] !== undefined);
    if (!names.length) return this.get<T>(Key);
    try {
      const {Attributes} = await this.db.send(new UpdateCommand({
        TableName: this.table,
        Key,
        UpdateExpression: `SET ${names.map((_, i) => `#f${i} = :v${i}`).join(', ')}`,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(names.map((name, i) => [`#f${i}`, name])),
        ExpressionAttributeValues: Object.fromEntries(names.map((name, i) => [`:v${i}`, fields[name]])),
        ReturnValues: 'ALL_NEW',
      }));
      return Attributes && record<T>(Attributes);
    } catch (error) {
      if (isNamed(error, 'ConditionalCheckFailedException')) return undefined;
      throw error;
    }
  }

  /**
   * Runs a transaction. Returns the indexes of the items whose condition failed (nothing was written then),
   * or [] when it went through. Clashes with another transaction on the same items are retried.
   */
  private async transact(items: TransactItem[]): Promise<number[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.db.send(new TransactWriteCommand({TransactItems: items}));
        return [];
      } catch (error) {
        if (!isNamed(error, 'TransactionCanceledException')) throw error;
        const reasons = (error.CancellationReasons ?? []) as {Code?: string}[];
        const failed = reasons.flatMap((reason, i) => (reason.Code === 'ConditionalCheckFailed' ? [i] : []));
        if (failed.length) return failed;
        if (attempt >= 3 || !reasons.some(reason => reason.Code === 'TransactionConflict')) throw error;
        await sleep(25 * 2 ** attempt);
      }
    }
  }

  private async deleteAll(keys: Item[]) {
    for (let i = 0; i < keys.length; i += 25) {
      let requests = keys.slice(i, i + 25).map(Key => ({DeleteRequest: {Key}}));
      for (let attempt = 0; requests.length; attempt++) {
        if (attempt === 6) throw new Error('DynamoDB kept leaving deletes unprocessed');
        if (attempt) await sleep(50 * 2 ** attempt);
        const {UnprocessedItems} = await this.db.send(new BatchWriteCommand({RequestItems: {[this.table]: requests}}));
        requests = (UnprocessedItems?.[this.table] ?? []) as typeof requests;
      }
    }
  }

  /** The ledger entry and the child's balance (and penalty debt) in one go; with `minBalanceSec`, only if the balance is that high. */
  private credit(familyId: string, entry: LedgerEntry, debtSec = 0, minBalanceSec?: number): TransactItem[] {
    return [
      {Put: {
        TableName: this.table,
        Item: {...entryKey(familyId, entry), ...adjustmentIndex(familyId, entry), ...entry},
        ConditionExpression: 'attribute_not_exists(PK)',
      }},
      {Update: {
        TableName: this.table,
        Key: childKey(familyId, entry.childId),
        UpdateExpression: debtSec > 0 ? 'ADD balanceSec :delta, debtSec :debt' : 'ADD balanceSec :delta',
        ConditionExpression: minBalanceSec === undefined ? 'attribute_exists(PK)' : 'attribute_exists(PK) AND balanceSec >= :min',
        ExpressionAttributeValues: {
          ':delta': entry.deltaSec, ...(debtSec > 0 && {':debt': debtSec}), ...(minBalanceSec !== undefined && {':min': minBalanceSec}),
        },
      }},
    ];
  }

  // ---------- families and parents ----------

  async familyIdOf(sub: string) {
    const [link] = await this.queryItems({KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: {':pk': `USER#${sub}`}, Limit: 1}, 1);
    return link?.familyId as string | undefined;
  }

  async createFamily(family: Family, parent: Parent) {
    const failed = await this.transact([
      {Put: {TableName: this.table, Item: {...key(fam(family.id), 'META'), ...family}, ConditionExpression: 'attribute_not_exists(PK)'}},
      {Put: {TableName: this.table, Item: {...key(fam(family.id), `PARENT#${parent.sub}`), ...parent}}},
      {Put: {TableName: this.table, Item: {...key(`USER#${parent.sub}`, fam(family.id)), familyId: family.id}}},
    ]);
    if (failed.length) throw new Error(`Family ${family.id} exists already`);
  }

  async getFamily(familyId: string) {
    return this.get<Family>(key(fam(familyId), 'META'));
  }

  async putFamily(family: Family) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...key(fam(family.id), 'META'), ...family}}));
  }

  // ---------- children ----------

  async listChildren(familyId: string) {
    return this.family<Child>(familyId, 'CHILD#');
  }

  async getChild(familyId: string, childId: string) {
    return this.get<Child>(childKey(familyId, childId));
  }

  async putChild(familyId: string, child: Child) {
    await this.db.send(new PutCommand({
      TableName: this.table, Item: {...childKey(familyId, child.id), ...child}, ConditionExpression: 'attribute_not_exists(PK)',
    }));
  }

  async updateChildProfile(familyId: string, childId: string, profile: ChildProfile) {
    return this.update<Child>(childKey(familyId, childId), profile);
  }

  async deleteChild(familyId: string, childId: string) {
    const groups = await Promise.all([
      this.keysWithPrefix(familyId, `LEDGER#${childId}#`),
      this.keysWithPrefix(familyId, `SLOT#${childId}#`),
      this.keysWithPrefix(familyId, `REF#${childId}#`),
      this.keysWithPrefix(familyId, 'CLAIM#', {expression: 'childId = :child', values: {':child': childId}}),
    ]);
    await this.deleteAll([...groups.flat(), childKey(familyId, childId)]);
  }

  // ---------- chores ----------

  async listChores(familyId: string) {
    return this.family<Chore>(familyId, 'CHORE#');
  }

  async getChore(familyId: string, choreId: string) {
    return this.get<Chore>(choreKey(familyId, choreId));
  }

  async putChore(familyId: string, chore: Chore, expectUpdatedAt?: number) {
    return this.conditional(() => this.db.send(new PutCommand({
      TableName: this.table,
      Item: {...choreKey(familyId, chore.id), ...chore},
      ...(expectUpdatedAt === undefined
        ? {ConditionExpression: 'attribute_not_exists(PK)'}
        : {ConditionExpression: 'updatedAt = :expected', ExpressionAttributeValues: {':expected': expectUpdatedAt}}),
    })));
  }

  async deleteChore(familyId: string, choreId: string, expectUpdatedAt?: number) {
    return this.conditional(() => this.db.send(new DeleteCommand({
      TableName: this.table,
      Key: choreKey(familyId, choreId),
      ...(expectUpdatedAt !== undefined && {ConditionExpression: 'updatedAt = :expected', ExpressionAttributeValues: {':expected': expectUpdatedAt}}),
    })));
  }

  // ---------- claims ----------

  async getClaim(familyId: string, claimId: string) {
    return this.get<Claim>(claimKey(familyId, claimId));
  }

  async createClaim(familyId: string, claim: Claim) {
    const failed = await this.transact([
      {Put: {
        TableName: this.table,
        Item: {...claimKey(familyId, claim.id), GSI1PK: `CLAIMS#${familyId}`, GSI1SK: claimIndexKey(claim), ...claim},
        ConditionExpression: 'attribute_not_exists(PK)',
      }},
      {Put: {
        TableName: this.table,
        // A day's slot only matters on that day; a one-off job's slot lives until the claim is decided.
        Item: {...slotKey(familyId, claim), claimId: claim.id, ...(claim.slot !== 'once' && {ttl: seconds(claim.createdAt + 3 * DAY)})},
        ConditionExpression: 'attribute_not_exists(PK)',
      }},
    ]);
    return failed.includes(0) ? 'exists' : failed.includes(1) ? 'slot_taken' : 'created';
  }

  async deleteClaim(familyId: string, claim: Claim) {
    const failed = await this.transact([
      {Delete: {
        TableName: this.table,
        Key: claimKey(familyId, claim.id),
        ConditionExpression: '#status = :waiting',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':waiting': 'waiting'},
      }},
      {Delete: {TableName: this.table, Key: slotKey(familyId, claim)}},
    ]);
    return failed.length === 0;
  }

  async decideClaim(familyId: string, {claim, releaseSlot, entry, chore}: Decision) {
    const items: TransactItem[] = [{Update: {
      TableName: this.table,
      Key: claimKey(familyId, claim.id),
      UpdateExpression: 'SET #status = :status, decidedAt = :at, decidedBy = :by, GSI1SK = :index',
      ConditionExpression: '#status = :waiting',
      ExpressionAttributeNames: {'#status': 'status'},
      ExpressionAttributeValues: {':status': claim.status, ':at': claim.decidedAt, ':by': claim.decidedBy, ':index': claimIndexKey(claim), ':waiting': 'waiting'},
    }}];
    if (releaseSlot) items.push({Delete: {TableName: this.table, Key: slotKey(familyId, claim)}});
    if (entry) items.push(...this.credit(familyId, entry));
    const choreAt = items.length;
    if (chore) {
      const unchanged = {ConditionExpression: 'updatedAt = :expected', ExpressionAttributeValues: {':expected': chore.before.updatedAt}};
      items.push(chore.after
        ? {Put: {TableName: this.table, Item: {...choreKey(familyId, chore.after.id), ...chore.after}, ...unchanged}}
        : {Delete: {TableName: this.table, Key: choreKey(familyId, chore.before.id), ...unchanged}});
    }
    const failed = await this.transact(items);
    if (!failed.length) return 'ok';
    return chore && failed.length === 1 && failed[0] === choreAt ? 'chore_changed' : 'not_waiting';
  }

  async waitingClaims(familyId: string) {
    const items = await this.queryItems({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :waiting)',
      ExpressionAttributeValues: {':pk': `CLAIMS#${familyId}`, ':waiting': 'W#'},
    });
    return items.map(item => record<Claim>(item));
  }

  async decidedClaims(familyId: string, since: number, limit: number) {
    const items = await this.queryItems({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
      ExpressionAttributeValues: {':pk': `CLAIMS#${familyId}`, ':from': `D#${pad(since)}`, ':to': 'D#~'},
      ScanIndexForward: false,
      Limit: limit,
    }, limit);
    return items.map(item => record<Claim>(item));
  }

  // ---------- ledger ----------

  async addEntry(familyId: string, entry: LedgerEntry, options: {ref?: {id: string; value: Ref}; debtSec?: number; minBalanceSec?: number} = {}) {
    const items = this.credit(familyId, entry, options.debtSec, options.minBalanceSec);
    if (options.ref) {
      items.push({Put: {
        TableName: this.table,
        Item: {...refKey(familyId, entry.childId, options.ref.id), ...options.ref.value, ttl: seconds(entry.createdAt + 30 * DAY)},
        ConditionExpression: 'attribute_not_exists(PK)',
      }});
    }
    const failed = await this.transact(items);
    return !failed.length ? 'ok' : failed.includes(2) ? 'duplicate' : 'changed';
  }

  async creditGame(familyId: string, ref: string, {childId, marbles, before, after, entry}: GameCredit) {
    const items: TransactItem[] = [{Put: {
      TableName: this.table,
      Item: {...refKey(familyId, childId, ref), kind: 'game', marbles, ttl: seconds(Date.now() + 30 * DAY)},
      ConditionExpression: 'attribute_not_exists(PK)',
    }}];
    if (entry) {
      const counter = before.day === undefined
        ? {condition: 'attribute_not_exists(gameDay)', values: {}}
        : {condition: 'gameDay = :beforeDay AND gameMarbles = :beforeMarbles', values: {':beforeDay': before.day, ':beforeMarbles': before.marbles ?? 0}};
      items.push(
        {Put: {TableName: this.table, Item: {...entryKey(familyId, entry), ...entry}, ConditionExpression: 'attribute_not_exists(PK)'}},
        {Update: {
          TableName: this.table,
          Key: childKey(familyId, childId),
          UpdateExpression: 'SET gameDay = :day, gameMarbles = :marbles ADD balanceSec :delta',
          ConditionExpression: `attribute_exists(PK) AND ${counter.condition}`,
          ExpressionAttributeValues: {':day': after.day, ':marbles': after.marbles, ':delta': entry.deltaSec, ...counter.values},
        }},
      );
    }
    const failed = await this.transact(items);
    return !failed.length ? 'ok' : failed.includes(0) ? 'duplicate' : 'changed';
  }

  async getRef(familyId: string, childId: string, id: string) {
    return this.get<Ref>(refKey(familyId, childId, id));
  }

  async entries(familyId: string, childId: string, limit: number) {
    const items = await this.queryItems({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {':pk': fam(familyId), ':prefix': `LEDGER#${childId}#`},
      ScanIndexForward: false,
      Limit: limit,
    }, limit);
    return items.map(item => record<LedgerEntry>(item));
  }

  async pendingEntries(familyId: string, childId: string) {
    return this.family<LedgerEntry>(familyId, `LEDGER#${childId}#`, {expression: 'handoff = :pending', values: {':pending': 'PENDING'}});
  }

  async adjustments(familyId: string, since: number) {
    const items = await this.queryItems({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK >= :from',
      ExpressionAttributeValues: {':pk': `ADJ#${familyId}`, ':from': pad(since)},
      ScanIndexForward: false,
    });
    return items.map(item => record<LedgerEntry>(item));
  }

  async settleEntries(familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number) {
    const items: TransactItem[] = entries.map(entry => ({Update: {
      TableName: this.table,
      Key: entryKey(familyId, entry),
      UpdateExpression: 'SET handoff = :status',
      ConditionExpression: 'handoff = :pending',
      ExpressionAttributeValues: {':status': status, ':pending': 'PENDING'},
    }}));
    if (debtPaidSec > 0) {
      items.push({Update: {
        TableName: this.table,
        Key: childKey(familyId, childId),
        UpdateExpression: 'ADD debtSec :minus',
        ConditionExpression: 'debtSec >= :paid',
        ExpressionAttributeValues: {':minus': -debtPaidSec, ':paid': debtPaidSec},
      }});
    }
    return !items.length || (await this.transact(items)).length === 0;
  }

  // ---------- pairing and devices ----------

  async createPairing(pairing: Pairing) {
    return this.conditional(() => this.db.send(new PutCommand({
      TableName: this.table,
      // Kept a day past expiry so a late poll still hears "expired" rather than "no such code".
      Item: {...pairingKey(pairing.code), ...pairing, ttl: seconds(pairing.expiresAt + DAY)},
      ConditionExpression: 'attribute_not_exists(PK)',
    })));
  }

  async getPairing(code: string) {
    return this.get<Pairing>(pairingKey(code));
  }

  async confirmPairing(code: string, device: Device, now: number) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: pairingKey(code),
        UpdateExpression: 'SET #status = :paired, familyId = :family, deviceId = :device',
        ConditionExpression: '#status = :waiting AND expiresAt >= :now',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':paired': 'paired', ':waiting': 'waiting', ':family': device.familyId, ':device': device.id, ':now': now},
      }},
      {Put: {TableName: this.table, Item: {...deviceKey(device.familyId, device.id), ...device}, ConditionExpression: 'attribute_not_exists(PK)'}},
    ]);
    return failed.length === 0;
  }

  async issueToken(code: string, familyId: string, deviceId: string, tokenHash: string) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: pairingKey(code),
        UpdateExpression: 'SET tokenIssued = :yes',
        ConditionExpression: '#status = :paired AND attribute_not_exists(tokenIssued)',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':yes': true, ':paired': 'paired'},
      }},
      {Update: {
        TableName: this.table,
        Key: deviceKey(familyId, deviceId),
        UpdateExpression: 'SET tokenHash = :hash, GSI1PK = :token, GSI1SK = :dev',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {':hash': tokenHash, ':token': `TOKEN#${tokenHash}`, ':dev': 'DEV'},
      }},
    ]);
    return failed.length === 0;
  }

  /** GSI1 is eventually consistent: a token handed out a moment ago may not be indexed yet, so a miss looks once more. */
  async deviceByToken(tokenHash: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(300);
      const [item] = await this.queryItems({
        IndexName: 'GSI1', KeyConditionExpression: 'GSI1PK = :token', ExpressionAttributeValues: {':token': `TOKEN#${tokenHash}`}, Limit: 1,
      }, 1);
      if (item) return record<Device>(item);
    }
    return undefined;
  }

  async getDevice(familyId: string, deviceId: string) {
    return this.get<Device>(deviceKey(familyId, deviceId));
  }

  async listDevices(familyId: string) {
    return this.family<Device>(familyId, 'DEV#');
  }

  async updateDevice(familyId: string, deviceId: string, fields: Partial<Pick<Device, 'name' | 'mode' | 'lastSeen' | 'appVersion' | 'pinFails'>>) {
    return this.update<Device>(deviceKey(familyId, deviceId), fields);
  }

  async deleteDevice(familyId: string, deviceId: string) {
    await this.db.send(new DeleteCommand({TableName: this.table, Key: deviceKey(familyId, deviceId)}));
  }
}
