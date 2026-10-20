/**
 * DynamoDB storage: one table (docs/03 §7), on-demand. Every write that touches more than one item is one
 * transaction, and client UUIDs are keys or conditional puts, so a retried request changes nothing twice.
 *
 *   PK            SK                              what
 *   FAM#<f>       META                            family
 *   FAM#<f>       PARENT#<sub>                    parent
 *   USER#<sub>    FAM#<f>                         a parent's family
 *   USER#<sub>    PROFILE                         the parent's name as kids see it ("– Dad")
 *   FAM#<f>       CHILD#<c>                       child (balance, daily budget, character tokens, penalty debt, minutes
 *                                                 marked handed off today, which leave the jar at the next midnight)
 *   FAM#<f>       CHORE#<k>                       job
 *   FAM#<f>       CLAIM#<id>                      claim (id = the TV's UUID)
 *   FAM#<f>       SLOT#<c>#<k>#<day|once>         the claim holding a job's day ("at most once per day")
 *   FAM#<f>       LEDGER#<c>#<createdAt>#<id>     ledger entry (time-ordered per child; HANDOFF entries too)
 *   FAM#<f>       REF#<c>#<client id>             what an adjust produced (repeats get it back)
 *   FAM#<f>       CHAR#<id>                       character (status, the kid's words, the card; small)
 *   FAM#<f>       ART#<id>                        a ready character's SVG and layers (written once, ~10–40 KB)
 *   FAM#<f>       RATE#<key>#<window start>       uses of a rate-limited thing in a window (a TV's new speech lines)
 *   FAM#<f>       DEV#<d>                         TV
 *   FAM#<f>       PUSH#<sha256 of the endpoint>   a parent's browser that wants notifications (Web Push)
 *   CONN#<f>      <connection id>                 an open realtime (WebSocket) connection of the family
 *   CONNID#<id>   META                            which family a connection belongs to (for $disconnect)
 *   PAIR#<code>   META                            pairing
 *   LEASE#<name>  META                            who is making something only one may make at a time (a speech line), until when
 *
 * GSI1 (all attributes): GSI1PK TOKEN#<sha256 of the device token> / GSI1SK DEV finds a TV by its token;
 * GSI1PK CLAIMS#<f> / GSI1SK W#<createdAt>#<id> (waiting) or D#<decidedAt>#<id> (decided) lists claims;
 * GSI1PK ADJ#<f> / GSI1SK <createdAt>#<id> lists bonuses and taken-away minutes (BONUS and PENALTY entries).
 * TTL attribute `ttl` (seconds): pairings (a day after expiry), day slots (3 days), refs (30 days), rate windows
 * (an hour after the window), connections (3 hours), leases (an hour after they run out). Items of the old brain games (POOL#, FILL#, gameDay and
 * gameMarbles on children) are ignored; their TTLs remove the pools and marks.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, type QueryCommandInput, TransactWriteCommand,
  type TransactWriteCommandInput, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {ChildProfile, Decision, FamilyFields, Repo, Used} from '../domain/repo';
import type {PuzzleProgress, PuzzleRound, PuzzleSet} from '../puzzles/pick';
import {sha256Hex} from '../domain/secrets';
import {DAY, HOUR} from '../domain/time';
import type {
  Character, CharacterArt, Chore, Child, Claim, Connection, Device, Family, HandoffStatus, LedgerEntry, Pairing, Parent, PushPass, PushSubscription, Ref,
} from '../domain/types';

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
const puzzleSetKey = (familyId: string, childId: string) => key(fam(familyId), `PUZZLESET#${childId}`);
const puzzleRoundsKey = (familyId: string, childId: string) => key(fam(familyId), `PUZZLEROUNDS#${childId}`);
const refKey = (familyId: string, childId: string, id: string) => key(fam(familyId), `REF#${childId}#${id}`);
const deviceKey = (familyId: string, deviceId: string) => key(fam(familyId), `DEV#${deviceId}`);
const pairingKey = (code: string) => key(`PAIR#${code}`, 'META');
const pushPassKey = (hash: string) => key(`PUSHPASS#${hash}`, 'META');
const connectionKey = (c: Pick<Connection, 'id' | 'familyId'>) => key(`CONN#${c.familyId}`, c.id);
const connectionIdKey = (connectionId: string) => key(`CONNID#${connectionId}`, 'META');
const pushKey = (familyId: string, endpoint: string) => key(fam(familyId), `PUSH#${sha256Hex(endpoint)}`);
const characterKey = (familyId: string, characterId: string) => key(fam(familyId), `CHAR#${characterId}`);
const artKey = (familyId: string, characterId: string) => key(fam(familyId), `ART#${characterId}`);
const profileKey = (sub: string) => key(`USER#${sub}`, 'PROFILE');
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

  /**
   * The ledger entry and the child's balance (and penalty debt) in one go. With `minBalanceSec`, only if the balance is
   * that high; with `balanceSec`, only if the balance is exactly that (nobody changed the jar since it was read).
   */
  private credit(familyId: string, entry: LedgerEntry, options: {debtSec?: number; minBalanceSec?: number; balanceSec?: number; token?: boolean; used?: Used} = {}): TransactItem[] {
    const {debtSec = 0, minBalanceSec, balanceSec, token = false, used} = options;
    const conditions = [
      'attribute_exists(PK)', ...(minBalanceSec === undefined ? [] : ['balanceSec >= :min']), ...(balanceSec === undefined ? [] : ['balanceSec = :read']),
      // Watched time is written on top of what was read: the same day and base part, or no day yet.
      ...(used ? [used.prevDay === undefined ? 'attribute_not_exists(usedDay)' : 'usedDay = :prevDay'] : []),
      ...(used && used.prevDay === used.day ? ['usedBaseSec = :prevBase'] : []),
    ];
    return [
      {Put: {
        TableName: this.table,
        Item: {...entryKey(familyId, entry), ...adjustmentIndex(familyId, entry), ...entry},
        ConditionExpression: 'attribute_not_exists(PK)',
      }},
      {Update: {
        TableName: this.table,
        Key: childKey(familyId, entry.childId),
        // One update for everything the kid gets: a transaction may touch an item only once.
        UpdateExpression: `${used ? 'SET usedDay = :day, usedBaseSec = :base, usedEarnedSec = :earned ' : ''}ADD balanceSec :delta${debtSec > 0 ? ', debtSec :debt' : ''}${token ? ', characterTokens :one' : ''}`,
        ConditionExpression: conditions.join(' AND '),
        ExpressionAttributeValues: {
          ':delta': entry.deltaSec, ...(debtSec > 0 && {':debt': debtSec}), ...(minBalanceSec !== undefined && {':min': minBalanceSec}),
          ...(balanceSec !== undefined && {':read': balanceSec}), ...(token && {':one': 1}),
          ...(used && {':day': used.day, ':base': used.baseSec, ':earned': used.earnedSec}),
          ...(used && used.prevDay !== undefined && {':prevDay': used.prevDay}), ...(used && used.prevDay === used.day && {':prevBase': used.prevBaseSec}),
        },
      }},
    ];
  }

  // ---------- families and parents ----------

  async familyIdOf(sub: string) {
    const [link] = await this.queryItems({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :family)', ExpressionAttributeValues: {':pk': `USER#${sub}`, ':family': 'FAM#'}, Limit: 1,
    }, 1);
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

  async updateFamily(familyId: string, fields: FamilyFields) {
    return this.update<Family>(key(fam(familyId), 'META'), fields);
  }

  async getParentName(sub: string) {
    return (await this.get<{name?: string}>(profileKey(sub)))?.name;
  }

  async setParentName(sub: string, name: string) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...profileKey(sub), name}}));
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
      this.keysWithPrefix(familyId, 'CHAR#', {expression: 'childId = :child', values: {':child': childId}}),
      this.keysWithPrefix(familyId, 'ART#', {expression: 'childId = :child', values: {':child': childId}}),
    ]);
    await this.deleteAll([...groups.flat(), puzzleSetKey(familyId, childId), puzzleRoundsKey(familyId, childId), childKey(familyId, childId)]);
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

  async decideClaim(familyId: string, {claim, releaseSlot, entry, token, balanceSec, chore}: Decision) {
    // What a decision sets on the claim; fields it doesn't have stay unset.
    const fields = {
      status: claim.status, decidedAt: claim.decidedAt, decidedBy: claim.decidedBy, approverName: claim.approverName, reward: claim.reward,
      minutesCredited: claim.minutesCredited, notYetReason: claim.notYetReason, GSI1SK: claimIndexKey(claim),
    };
    const names = Object.keys(fields).filter(name => fields[name as keyof typeof fields] !== undefined);
    const items: TransactItem[] = [{Update: {
      TableName: this.table,
      Key: claimKey(familyId, claim.id),
      UpdateExpression: `SET ${names.map((_, i) => `#f${i} = :v${i}`).join(', ')}`,
      ConditionExpression: '#status = :waiting',
      ExpressionAttributeNames: {'#status': 'status', ...Object.fromEntries(names.map((name, i) => [`#f${i}`, name]))},
      ExpressionAttributeValues: {':waiting': 'waiting', ...Object.fromEntries(names.map((name, i) => [`:v${i}`, fields[name as keyof typeof fields]]))},
    }}];
    if (releaseSlot) items.push({Delete: {TableName: this.table, Key: slotKey(familyId, claim)}});
    const childAt = entry ? items.length + 1 : items.length;
    // Marbles and a character together (a job that only partly fitted) are one update of the kid.
    if (entry) items.push(...this.credit(familyId, entry, {balanceSec, token}));
    else if (token) {
      items.push({Update: {
        TableName: this.table,
        Key: childKey(familyId, claim.childId),
        UpdateExpression: 'ADD characterTokens :one',
        ConditionExpression: 'attribute_exists(PK) AND balanceSec = :read',
        ExpressionAttributeValues: {':one': 1, ':read': balanceSec},
      }});
    }
    const choreAt = items.length;
    if (chore) {
      const unchanged = {ConditionExpression: 'updatedAt = :expected', ExpressionAttributeValues: {':expected': chore.before.updatedAt}};
      items.push(chore.after
        ? {Put: {TableName: this.table, Item: {...choreKey(familyId, chore.after.id), ...chore.after}, ...unchanged}}
        : {Delete: {TableName: this.table, Key: choreKey(familyId, chore.before.id), ...unchanged}});
    }
    const failed = await this.transact(items);
    if (!failed.length) return 'ok';
    if (failed.includes(0)) return 'not_waiting';
    if ((entry || token) && failed.includes(childAt)) return 'changed';
    return chore && failed.includes(choreAt) ? 'chore_changed' : 'not_waiting';
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

  async addEntry(familyId: string, entry: LedgerEntry, options: {ref?: {id: string; value: Ref}; debtSec?: number; minBalanceSec?: number; used?: Used} = {}) {
    const items = this.credit(familyId, entry, {debtSec: options.debtSec, minBalanceSec: options.minBalanceSec, used: options.used});
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

  async getPuzzleSet(familyId: string, childId: string) {
    return this.get<PuzzleSet>(puzzleSetKey(familyId, childId));
  }

  async putPuzzleSet(familyId: string, childId: string, set: PuzzleSet) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...puzzleSetKey(familyId, childId), ...set}}));
  }

  async getPuzzleRounds(familyId: string, childId: string) {
    return (await this.get<{rounds: PuzzleRound[]}>(puzzleRoundsKey(familyId, childId)))?.rounds ?? [];
  }

  async putPuzzleRounds(familyId: string, childId: string, rounds: PuzzleRound[]) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...puzzleRoundsKey(familyId, childId), rounds}}));
  }

  async finishPuzzles(familyId: string, childId: string, done: {refId: string; day: string; stars: number; token: boolean; progress: PuzzleProgress; prevStars: number}) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: childKey(familyId, childId),
        UpdateExpression: `SET puzzleStars = :stars, puzzleDay = :day, puzzleLevels = :levels, puzzleStreaks = :streaks, puzzleSeen = :seen${done.token ? ' ADD characterTokens :one' : ''}`,
        // Kids from before puzzles have no stars yet.
        ConditionExpression: `attribute_exists(PK) AND ${done.prevStars === 0 ? '(attribute_not_exists(puzzleStars) OR puzzleStars = :prev)' : 'puzzleStars = :prev'}`,
        ExpressionAttributeValues: {
          ':stars': done.stars, ':day': done.day, ':levels': done.progress.levels, ':streaks': done.progress.streaks, ':seen': done.progress.seen,
          ':prev': done.prevStars, ...(done.token && {':one': 1}),
        },
      }},
      {Put: {
        TableName: this.table,
        Item: {...refKey(familyId, childId, done.refId), kind: 'puzzle', ttl: seconds(Date.now() + 30 * DAY)},
        ConditionExpression: 'attribute_not_exists(PK)',
      }},
    ]);
    return !failed.length ? 'ok' : failed.includes(1) ? 'duplicate' : 'changed';
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

  async settleEntries(
    familyId: string, childId: string, entries: LedgerEntry[], status: Exclude<HandoffStatus, 'PENDING'>, debtPaidSec: number,
    due: {sec: number; day: string},
  ) {
    const items: TransactItem[] = entries.map(entry => ({Update: {
      TableName: this.table,
      Key: entryKey(familyId, entry),
      UpdateExpression: 'SET handoff = :status',
      ConditionExpression: 'handoff = :pending',
      ExpressionAttributeValues: {':status': status, ':pending': 'PENDING'},
    }}));
    if (debtPaidSec > 0 || due.sec > 0) {
      // The debt it pays and the minutes due to leave the jar after `due.day`, on the child in one update.
      const adds = [...(debtPaidSec > 0 ? ['debtSec :minus'] : []), ...(due.sec > 0 ? ['handoffDueSec :due'] : [])];
      const conditions = [
        'attribute_exists(PK)', ...(debtPaidSec > 0 ? ['debtSec >= :paid'] : []),
        ...(due.sec > 0 ? ['(attribute_not_exists(handoffDueDay) OR handoffDueDay = :day)'] : []),
      ];
      items.push({Update: {
        TableName: this.table,
        Key: childKey(familyId, childId),
        UpdateExpression: `${due.sec > 0 ? 'SET handoffDueDay = :day ' : ''}ADD ${adds.join(', ')}`,
        ConditionExpression: conditions.join(' AND '),
        ExpressionAttributeValues: {
          ...(debtPaidSec > 0 && {':minus': -debtPaidSec, ':paid': debtPaidSec}),
          ...(due.sec > 0 && {':due': due.sec, ':day': due.day}),
        },
      }});
    }
    return !items.length || (await this.transact(items)).length === 0;
  }

  async settleDue(familyId: string, childId: string, {entry, debtPaidSec, read}: {
    entry?: LedgerEntry; debtPaidSec: number; read: Pick<Child, 'balanceSec' | 'debtSec' | 'handoffDueSec' | 'handoffDueDay'>;
  }) {
    const items: TransactItem[] = [];
    if (entry) items.push({Put: {TableName: this.table, Item: {...entryKey(familyId, entry), ...entry}, ConditionExpression: 'attribute_not_exists(PK)'}});
    const adds = [...(entry ? ['balanceSec :delta'] : []), ...(debtPaidSec > 0 ? ['debtSec :minus'] : [])];
    items.push({Update: {
      TableName: this.table,
      Key: childKey(familyId, childId),
      UpdateExpression: `${adds.length ? `ADD ${adds.join(', ')} ` : ''}REMOVE handoffDueSec, handoffDueDay`,
      ConditionExpression: 'balanceSec = :balance AND debtSec = :debt AND handoffDueSec = :due AND handoffDueDay = :day',
      ExpressionAttributeValues: {
        ':balance': read.balanceSec, ':debt': read.debtSec, ':due': read.handoffDueSec, ':day': read.handoffDueDay,
        ...(entry && {':delta': entry.deltaSec}), ...(debtPaidSec > 0 && {':minus': -debtPaidSec}),
      },
    }});
    return (await this.transact(items)).length === 0;
  }

  // ---------- characters ----------

  async startCharacter(familyId: string, character: Character) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: childKey(familyId, character.childId),
        UpdateExpression: 'ADD characterTokens :minus',
        ConditionExpression: 'attribute_exists(PK) AND characterTokens >= :one',
        ExpressionAttributeValues: {':minus': -1, ':one': 1},
      }},
      {Put: {TableName: this.table, Item: {...characterKey(familyId, character.id), ...character}, ConditionExpression: 'attribute_not_exists(PK)'}},
    ]);
    if (failed.includes(1)) throw new Error(`Character ${character.id} exists already`);
    return failed.length ? 'no_tokens' : 'ok';
  }

  async getCharacter(familyId: string, characterId: string) {
    return this.get<Character>(characterKey(familyId, characterId));
  }

  async listCharacters(familyId: string, childId?: string) {
    return this.family<Character>(familyId, 'CHAR#', childId === undefined ? undefined : {expression: 'childId = :child', values: {':child': childId}});
  }

  async getCharacterArt(familyId: string, characterId: string) {
    return this.get<CharacterArt>(artKey(familyId, characterId));
  }

  async listCharacterArt(familyId: string, childId?: string) {
    return this.family<CharacterArt>(familyId, 'ART#', childId === undefined ? undefined : {expression: 'childId = :child', values: {':child': childId}});
  }

  async finishCharacter(familyId: string, art: CharacterArt, readyAt: number) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: characterKey(familyId, art.id),
        UpdateExpression: 'SET #status = :ready, readyAt = :at',
        ConditionExpression: '#status = :drawing',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':ready': 'ready', ':at': readyAt, ':drawing': 'drawing'},
      }},
      {Put: {TableName: this.table, Item: {...artKey(familyId, art.id), ...art}}},
    ]);
    return failed.length === 0;
  }

  async failCharacter(familyId: string, character: Character) {
    const failed = await this.transact([
      {Update: {
        TableName: this.table,
        Key: characterKey(familyId, character.id),
        UpdateExpression: 'SET #status = :help',
        ConditionExpression: '#status = :drawing',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':help': 'needs_help', ':drawing': 'drawing'},
      }},
      {Update: {
        TableName: this.table,
        Key: childKey(familyId, character.childId),
        UpdateExpression: 'ADD characterTokens :one',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {':one': 1},
      }},
    ]);
    return failed.length === 0;
  }

  async removeCharacter(familyId: string, character: Character) {
    const items: TransactItem[] = [
      {Delete: {
        TableName: this.table,
        Key: characterKey(familyId, character.id),
        ConditionExpression: '#status = :status',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {':status': character.status},
      }},
      {Delete: {TableName: this.table, Key: artKey(familyId, character.id)}},
    ];
    if (character.status !== 'needs_help') {
      items.push({Update: {
        TableName: this.table,
        Key: childKey(familyId, character.childId),
        UpdateExpression: 'ADD characterTokens :one',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {':one': 1},
      }});
    }
    return (await this.transact(items)).length === 0;
  }

  async takeRate(familyId: string, rateKey: string, windowStart: number, windowMs: number, limit: number) {
    return this.conditional(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: key(fam(familyId), `RATE#${rateKey}#${pad(windowStart)}`),
      UpdateExpression: 'ADD #count :one SET #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
      ExpressionAttributeNames: {'#count': 'count', '#ttl': 'ttl'},
      ExpressionAttributeValues: {':one': 1, ':limit': limit, ':ttl': seconds(windowStart + windowMs + HOUR)},
    })));
  }

  async takeLease(name: string, holder: string, until: number, now: number) {
    return this.conditional(() => this.db.send(new PutCommand({
      TableName: this.table,
      Item: {...key(`LEASE#${name}`, 'META'), holder, until, ttl: seconds(until + HOUR)},
      ConditionExpression: 'attribute_not_exists(PK) OR #holder = :holder OR #until <= :now',
      ExpressionAttributeNames: {'#holder': 'holder', '#until': 'until'},
      ExpressionAttributeValues: {':holder': holder, ':now': now},
    })));
  }

  async releaseLease(name: string, holder: string) {
    await this.conditional(() => this.db.send(new DeleteCommand({
      TableName: this.table,
      Key: key(`LEASE#${name}`, 'META'),
      ConditionExpression: '#holder = :holder',
      ExpressionAttributeNames: {'#holder': 'holder'},
      ExpressionAttributeValues: {':holder': holder},
    })));
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

  async putPushPass(hash: string, pass: PushPass) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...pushPassKey(hash), ...pass, ttl: seconds(pass.expiresAt)}}));
  }

  async takePushPass(hash: string) {
    const {Attributes} = await this.db.send(new DeleteCommand({TableName: this.table, Key: pushPassKey(hash), ReturnValues: 'ALL_OLD'}));
    return Attributes && record<PushPass>(Attributes);
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

  async addConnection(connection: Connection) {
    const ttl = seconds(connection.expiresAt);
    await this.transact([
      {Put: {TableName: this.table, Item: {...connectionKey(connection), ...connection, ttl}}},
      {Put: {TableName: this.table, Item: {...connectionIdKey(connection.id), familyId: connection.familyId, ttl}}},
    ]);
  }

  async familyConnections(familyId: string, now: number) {
    const items = await this.queryItems({KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: {':pk': `CONN#${familyId}`}});
    return items.map(item => record<Connection>(item)).filter(c => c.expiresAt > now);
  }

  async removeConnection(connectionId: string) {
    const link = await this.get<{familyId: string}>(connectionIdKey(connectionId));
    await this.deleteAll([connectionIdKey(connectionId), ...(link ? [connectionKey({id: connectionId, familyId: link.familyId})] : [])]);
  }

  async putPushSubscription(familyId: string, subscription: PushSubscription) {
    await this.db.send(new PutCommand({TableName: this.table, Item: {...pushKey(familyId, subscription.endpoint), ...subscription}}));
  }

  async deletePushSubscription(familyId: string, endpoint: string) {
    await this.db.send(new DeleteCommand({TableName: this.table, Key: pushKey(familyId, endpoint)}));
  }

  async pushSubscriptions(familyId: string) {
    return this.family<PushSubscription>(familyId, 'PUSH#');
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
