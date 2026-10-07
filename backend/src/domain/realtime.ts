/**
 * Live updates (x-realtime in openapi.yaml): who may open a realtime connection, and telling a family's open
 * connections that something changed, so TVs and parent apps fetch what they show at once instead of on their
 * next poll.
 */
import type {Repo} from './repo';
import {sha256Hex} from './secrets';
import {HOUR} from './time';
import type {Connection} from './types';

export const CHANGED = JSON.stringify({type: 'changed'});
export const PONG = JSON.stringify({type: 'pong'});

/** API Gateway closes WebSocket connections after 2 hours at most; the stored one goes an hour later. */
const CONNECTION_TIME = 3 * HOUR;

/** A parent's Cognito token (access or ID) → the parent's sub, or undefined if it isn't valid. */
export type ParentTokenCheck = (token: string) => Promise<string | undefined>;

/** Sends a message to one open connection; false if the connection is gone (API Gateway: 410). */
export type SendRealtime = (connectionId: string, message: string) => Promise<boolean>;

/**
 * $connect: a TV with `device=<device token>`, or a parent with `token=<Cognito token>` whose family exists.
 * Stores the connection under the family; false refuses it.
 */
export async function connect(repo: Repo, verifyParent: ParentTokenCheck, connectionId: string, query: {device?: string; token?: string}, now: number) {
  let familyId: string | undefined;
  let kind: Connection['kind'];
  if (query.device) {
    familyId = (await repo.deviceByToken(sha256Hex(query.device)))?.familyId;
    kind = 'tv';
  } else if (query.token) {
    const sub = await verifyParent(query.token);
    familyId = sub === undefined ? undefined : await repo.familyIdOf(sub);
    kind = 'parent';
  } else {
    return false;
  }
  if (familyId === undefined || !(await repo.getFamily(familyId))) return false;
  await repo.addConnection({id: connectionId, familyId, kind, connectedAt: now, expiresAt: now + CONNECTION_TIME});
  return true;
}

export const disconnect = (repo: Repo, connectionId: string) => repo.removeConnection(connectionId);

/** Clients may send `{"type": "ping"}` (answered with PONG); anything else is ignored. */
export function isPing(message: string | undefined): boolean {
  try {
    return JSON.parse(message ?? '').type === 'ping';
  } catch {
    return false;
  }
}

/**
 * Sends `{"type": "changed"}` to every open connection of these families: one message per connection,
 * best-effort (errors are logged, never thrown), and connections that are gone are forgotten.
 */
export async function announce(repo: Repo, send: SendRealtime, familyIds: string[], now: number): Promise<void> {
  await Promise.all(familyIds.map(async familyId => {
    try {
      const connections = await repo.familyConnections(familyId, now);
      await Promise.all(connections.map(async connection => {
        try {
          if (!(await send(connection.id, CHANGED))) await repo.removeConnection(connection.id);
        } catch (error) {
          console.error(`telling connection ${connection.id} failed:`, error);
        }
      }));
    } catch (error) {
      console.error(`telling family ${familyId} about a change failed:`, error);
    }
  }));
}
