/**
 * The realtime (API Gateway WebSocket) Lambda: $connect checks who it is and stores the connection under the
 * family, $disconnect forgets it, and $default answers {"type": "ping"} with {"type": "pong"} (the route response).
 * Telling connections about changes is done by the API and generator Lambdas (domain/realtime.ts announce).
 */
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {connect, disconnect, isPing, PONG} from './domain/realtime';
import {DynamoRepo} from './repo/dynamo';

interface WebSocketEvent {
  requestContext: {routeKey: string; connectionId: string};
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
}

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const repo = new DynamoRepo(env('TABLE_NAME'));
// Access or ID tokens of the parent app's client, checked against the user pool's keys (fetched once and cached).
const verifier = CognitoJwtVerifier.create({userPoolId: env('USER_POOL_ID'), clientId: env('USER_POOL_CLIENT_ID'), tokenUse: null});

async function verifyParent(token: string): Promise<string | undefined> {
  try {
    return (await verifier.verify(token)).sub;
  } catch {
    return undefined;
  }
}

export async function handler(event: WebSocketEvent) {
  const {routeKey, connectionId} = event.requestContext;
  if (routeKey === '$connect') {
    const query = event.queryStringParameters ?? {};
    const accepted = await connect(repo, verifyParent, connectionId, {device: query.device, token: query.token}, Date.now());
    return {statusCode: accepted ? 200 : 401};
  }
  if (routeKey === '$disconnect') {
    await disconnect(repo, connectionId);
    return {statusCode: 200};
  }
  return isPing(event.body) ? {statusCode: 200, body: PONG} : {statusCode: 200};
}
