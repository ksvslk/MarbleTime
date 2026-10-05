/** A small router: one Lambda serves every route (fewer cold starts), and the dev server runs the same code. */
import type {Deps} from '../domain/deps';
import {ApiError} from '../domain/errors';
import type {Parent} from '../domain/types';

export interface HttpRequest {
  method: string;
  path: string;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body?: string;
  /** Set by the caller from verified credentials: API Gateway's JWT authorizer, or the dev server's dev tokens. */
  parent?: Parent;
}

export interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface Context {
  deps: Deps;
  req: HttpRequest;
  params: Record<string, string>;
  /** The parsed JSON body; undefined when there is none. */
  body: unknown;
}

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** As in openapi.yaml and API Gateway, e.g. /children/{childId}. */
  path: string;
  /** "parent" routes sit behind API Gateway's JWT authorizer (infra/stack.ts); "device" ones check the TV's token. */
  auth: 'parent' | 'device' | 'none';
  handle: (ctx: Context) => Promise<HttpResponse>;
}

export const json = (status: number, body: unknown, headers?: Record<string, string>): HttpResponse => ({status, body, ...(headers && {headers})});
export const noContent = (): HttpResponse => ({status: 204});

export function createRouter(routes: Route[], deps: Deps): (req: HttpRequest) => Promise<HttpResponse> {
  const compiled = routes.map(route => ({route, pattern: new RegExp(`^${route.path.replace(/\{(\w+)\}/g, '(?<$1>[^/]{1,100})')}$`)}));
  return async req => {
    try {
      const path = req.path.replace(/(?<=.)\/+$/, '');
      const matching = compiled.flatMap(({route, pattern}) => {
        const match = pattern.exec(path);
        return match ? [{route, params: match.groups ?? {}}] : [];
      });
      if (!matching.length) throw new ApiError(404, 'not_found', `No route ${path}`);
      const hit = matching.find(({route}) => route.method === req.method);
      if (!hit) throw new ApiError(405, 'method_not_allowed', `${req.method} is not allowed on ${path}`);
      return finish(await hit.route.handle({deps, req, params: decodeParams(hit.params), body: parseBody(req.body)}));
    } catch (error) {
      return finish(errorResponse(error));
    }
  };
}

function decodeParams(params: Record<string, string>): Record<string, string> {
  try {
    return Object.fromEntries(Object.entries(params).map(([name, value]) => [name, decodeURIComponent(value)]));
  } catch {
    throw new ApiError(404, 'not_found', 'Bad path');
  }
}

function parseBody(body: string | undefined): unknown {
  if (body === undefined || body.trim() === '') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, 'invalid_json', 'The body is not valid JSON');
  }
}

function errorResponse(error: unknown): HttpResponse {
  if (error instanceof ApiError) {
    return json(error.status, {error: {code: error.code, message: error.message}}, error.headers);
  }
  console.error('Unhandled error', error);
  return json(500, {error: {code: 'internal', message: 'Something went wrong on our side'}});
}

/** Personal data: no caching anywhere on the way. The TV revalidates its state with If-None-Match itself. */
function finish(response: HttpResponse): HttpResponse {
  const headers: Record<string, string> = {'cache-control': 'no-store', ...response.headers};
  if (response.body !== undefined) headers['content-type'] = 'application/json; charset=utf-8';
  return {...response, headers};
}
