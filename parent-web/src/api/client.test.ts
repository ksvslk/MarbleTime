import {describe, expect, it, vi} from 'vitest';
import {ApiError, createApi, type ApiOptions} from './client';

/** A fetch that answers with the given responses in order (an Error is thrown, like a dropped connection). */
function fakeFetch(...answers: (Response | Error)[]) {
  const calls: {url: string; init: RequestInit}[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({url, init});
    const next = answers.shift();
    if (!next) throw new Error('no answer left');
    if (next instanceof Error) throw next;
    return next;
  });
  return {fetch: fetch as unknown as typeof globalThis.fetch, calls};
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

function api(fetch: typeof globalThis.fetch, options: Partial<ApiOptions> = {}) {
  return createApi({baseUrl: 'http://api.test/', getToken: async () => 'dev-mia', fetch, ...options});
}

describe('API client', () => {
  it('sends the bearer token and a JSON body, and returns the parsed answer', async () => {
    const {fetch, calls} = fakeFetch(json(200, {balanceSec: 900, entry: {id: 'e1'}}));
    const result = await api(fetch).adjust('kid 1', {id: 'req-1', deltaMin: 15, reason: 'Helped'});

    expect(result.balanceSec).toBe(900);
    expect(calls[0].url).toBe('http://api.test/children/kid%201/adjust');
    expect(calls[0].init.method).toBe('POST');
    expect(header(calls[0].init, 'Authorization')).toBe('Bearer dev-mia');
    expect(header(calls[0].init, 'Content-Type')).toBe('application/json');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({id: 'req-1', deltaMin: 15, reason: 'Helped'});
  });

  it('asks for waiting claims and unwraps the list', async () => {
    const {fetch, calls} = fakeFetch(json(200, {claims: [{id: 'c1'}]}));
    expect(await api(fetch).claims('waiting')).toEqual([{id: 'c1'}]);
    expect(calls[0].url).toBe('http://api.test/claims?status=waiting');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('turns the contract’s error body into an ApiError with status, code and message', async () => {
    const {fetch} = fakeFetch(json(410, {error: {code: 'expired', message: 'The code expired'}}));
    const error = await api(fetch).confirmPairing('K7QX4M', {name: 'Living room TV'}).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status: 410, code: 'expired', message: 'The code expired'});
  });

  it('passes on the server’s code, e.g. 409 empty_jar when there is nothing earned to take away', async () => {
    const {fetch} = fakeFetch(json(409, {error: {code: 'empty_jar', message: 'Nothing earned'}}));
    const error = await api(fetch).adjust('k1', {id: 'req-2', deltaMin: -10, reason: 'Kept watching'}).catch(e => e);
    expect(error).toMatchObject({status: 409, code: 'empty_jar'});
  });

  it('copes with an error page that is not JSON', async () => {
    const {fetch} = fakeFetch(new Response('<html>Bad gateway</html>', {status: 502, statusText: 'Bad Gateway'}));
    const error = await api(fetch).family().catch(e => e);
    expect(error).toMatchObject({status: 502, code: 'http_502', message: 'Bad Gateway'});
  });

  it('reports a dropped connection as status 0, code "network"', async () => {
    const {fetch} = fakeFetch(new TypeError('Failed to fetch'));
    const error = await api(fetch).me().catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status: 0, code: 'network'});
  });

  it('returns nothing for 204 No Content', async () => {
    const {fetch, calls} = fakeFetch(new Response(null, {status: 204}));
    await expect(api(fetch).removeChild('c1')).resolves.toBeUndefined();
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('flags a success answer that is not JSON', async () => {
    const {fetch} = fakeFetch(new Response('<html>index</html>', {status: 200}));
    await expect(api(fetch).me()).rejects.toMatchObject({code: 'bad_response'});
  });

  it('on a 401 asks for a fresh token once and tries again with it', async () => {
    const tokens = ['old', 'new'];
    const onUnauthorized = vi.fn(async () => {
      tokens.shift();
      return true;
    });
    const {fetch, calls} = fakeFetch(json(401, {error: {code: 'unauthorized', message: ''}}), json(200, {parent: {id: 'p1'}, family: null}));
    const me = await api(fetch, {getToken: async () => tokens[0], onUnauthorized}).me();

    expect(me.family).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(header(calls[0].init, 'Authorization')).toBe('Bearer old');
    expect(header(calls[1].init, 'Authorization')).toBe('Bearer new');
  });

  it('gives up with the 401 when there is no fresh token, or the retry fails too', async () => {
    const unauthorized = () => json(401, {error: {code: 'unauthorized', message: 'Sign in'}});

    const refused = fakeFetch(unauthorized());
    await expect(api(refused.fetch, {onUnauthorized: async () => false}).me()).rejects.toMatchObject({status: 401});
    expect(refused.calls).toHaveLength(1);

    const onUnauthorized = vi.fn(async () => true);
    const twice = fakeFetch(unauthorized(), unauthorized());
    await expect(api(twice.fetch, {onUnauthorized}).me()).rejects.toMatchObject({status: 401, code: 'unauthorized'});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('sends no Authorization header when signed out', async () => {
    const {fetch, calls} = fakeFetch(json(200, {devices: []}));
    await api(fetch, {getToken: async () => null}).devices();
    expect(header(calls[0].init, 'Authorization')).toBeUndefined();
  });
});
