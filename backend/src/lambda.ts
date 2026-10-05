/** The one Lambda behind API Gateway (HTTP API, payload format 2.0). */
import {createApi} from './api';
import {pickIcon} from './icons';
import {DynamoRepo} from './repo/dynamo';

/** The parts of the HTTP API v2 event we use. */
interface HttpApiEvent {
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext: {
    http: {method: string};
    /** Present on parent routes: API Gateway's JWT authorizer has already checked the Cognito token. */
    authorizer?: {jwt?: {claims?: Record<string, unknown>}};
  };
}

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const api = createApi({repo: new DynamoRepo(env('TABLE_NAME')), now: Date.now, pwaUrl: env('PWA_URL'), pickIcon});

export async function handler(event: HttpApiEvent) {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  // Access tokens carry `sub` but no `email`; ID tokens carry both. Either passes the authorizer.
  const parent = typeof claims?.sub === 'string'
    ? {sub: claims.sub, ...(typeof claims.email === 'string' && {email: claims.email})}
    : undefined;
  const body = event.body !== undefined && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const response = await api({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers: event.headers ?? {},
    query: event.queryStringParameters ?? {},
    body,
    parent,
  });
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body === undefined ? '' : JSON.stringify(response.body),
  };
}
