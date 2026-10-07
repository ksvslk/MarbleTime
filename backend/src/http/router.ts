/** A small router: one Lambda serves every route (fewer cold starts), and the dev server runs the same code. */
import type {Deps} from '../domain/deps';
import {ApiError} from '../domain/errors';
import {announce} from '../domain/realtime';
import type {Parent} from '../domain/types';

export interface HttpRequest {
  method: string;
  path: string;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  /** The body as text (JSON routes). */
  body?: string;
  /** The body's bytes, for routes that take binary bodies (audio). */
  rawBody?: Buffer;
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
  /** The parsed JSON body; undefined when there is none (and on raw routes). */
  body: unknown;
  /** A raw route's body bytes (empty when there is none). */
  raw: Buffer;
}

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** As in openapi.yaml and API Gateway, e.g. /children/{childId}. */
  path: string;
  /** "parent" routes sit behind API Gateway's JWT authorizer (infra/stack.ts); "device" ones check the TV's token. */
  auth: 'parent' | 'device' | 'none';
  /** The body is binary (audio), handed over as bytes instead of parsed as JSON. */
  raw?: boolean;
  handle: (ctx: Context) => Promise<HttpResponse>;
}

export const json = (status: number, body: unknown, headers?: Record<string, string>): HttpResponse => ({status, body, ...(headers && {headers})});
export const noContent = (): HttpResponse => ({status: 204});

/** The dependencies a router is made with; `changed` is added per request. */
export type RouterDeps = Omit<Deps, 'changed'>;

export function createRouter(routes: Route[], baseDeps: RouterDeps): (req: HttpRequest) => Promise<HttpResponse> {
  const compiled = routes.map(route => ({route, pattern: new RegExp(`^${route.path.replace(/\{(\w+)\}/g, '(?<$1>[^/]{1,100})')}$`)}));
  return async req => {
    // Families this request changed: told once, after the request, even if a later step of it failed.
    const changed = new Set<string>();
    const deps: Deps = {...baseDeps, changed: familyId => changed.add(familyId)};
    try {
      return finish(await handle(deps, req));
    } catch (error) {
      return finish(errorResponse(error));
    } finally {
      if (changed.size) await announce(deps.repo, deps.sendRealtime, [...changed], deps.now());
    }
  };

  async function handle(deps: Deps, req: HttpRequest): Promise<HttpResponse> {
    const path = req.path.replace(/(?<=.)\/+$/, '');
    const matching = compiled.flatMap(({route, pattern}) => {
      const match = pattern.exec(path);
      return match ? [{route, params: match.groups ?? {}}] : [];
    });
    if (!matching.length) throw new ApiError(404, 'not_found', `No route ${path}`);
    const hit = matching.find(({route}) => route.method === req.method);
    if (!hit) throw new ApiError(405, 'method_not_allowed', `${req.method} is not allowed on ${path}`);
    const raw = hit.route.raw ? (req.rawBody ?? Buffer.from(req.body ?? '', 'utf8')) : Buffer.alloc(0);
    return hit.route.handle({deps, req, params: decodeParams(hit.params), body: hit.route.raw ? undefined : parseBody(req.body), raw});
  }
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
