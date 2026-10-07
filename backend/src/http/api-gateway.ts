/** API Gateway HTTP API (payload format 2.0) events ↔ the router's requests and responses. */
import type {HttpRequest, HttpResponse} from './router';

/** The parts of the HTTP API v2 event we use. */
export interface HttpApiEvent {
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

/**
 * The router's request. API Gateway base64-encodes bodies it doesn't take for text, such as the WAV of
 * /speech-to-text: those are decoded to bytes (rawBody), never through a UTF-8 string, which would mangle audio.
 */
export function toRequest(event: HttpApiEvent): HttpRequest {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  // Access tokens carry `sub` but no `email`; ID tokens carry both. Either passes the authorizer.
  const parent = typeof claims?.sub === 'string'
    ? {sub: claims.sub, ...(typeof claims.email === 'string' && {email: claims.email})}
    : undefined;
  const rawBody = event.body === undefined ? undefined : Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers: event.headers ?? {},
    query: event.queryStringParameters ?? {},
    ...(rawBody && {body: rawBody.toString('utf8'), rawBody}),
    ...(parent && {parent}),
  };
}

export const toResult = (response: HttpResponse) => ({
  statusCode: response.status,
  headers: response.headers,
  body: response.body === undefined ? '' : JSON.stringify(response.body),
});
