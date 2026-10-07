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

  it('sets the grown-up’s name as kids see it (PATCH /me) and returns who is signed in', async () => {
    const {fetch, calls} = fakeFetch(json(200, {parent: {id: 'p1', name: 'Dad'}, family: null}));
    const me = await api(fetch).patchMe({name: 'Dad'});
    expect(me.parent.name).toBe('Dad');
    expect(`${calls[0].init.method} ${calls[0].url}`).toBe('PATCH http://api.test/me');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({name: 'Dad'});
  });

  it('lists, makes and removes a kid’s characters', async () => {
    const drawing = {id: 'ch1', childId: 'k1', status: 'drawing', description: 'a dragon who loves pancakes', createdAt: 1};
    const {fetch, calls} = fakeFetch(json(200, {characters: [drawing]}), json(202, drawing), new Response(null, {status: 204}));
    const client = api(fetch);
    expect(await client.characters('k1')).toEqual([drawing]);
    expect(await client.addCharacter('k1', {description: 'a dragon who loves pancakes'})).toEqual(drawing);
    await client.removeCharacter('k1', 'ch 1');
    expect(calls.map(call => `${call.init.method} ${call.url}`)).toEqual([
      'GET http://api.test/children/k1/characters',
      'POST http://api.test/children/k1/characters',
      'DELETE http://api.test/children/k1/characters/ch%201',
    ]);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({description: 'a dragon who loves pancakes'});
  });

  it('sends a recording as audio/wav as it is (not JSON), and returns the words', async () => {
    const {fetch, calls} = fakeFetch(json(200, {text: 'a dragon who loves pancakes'}));
    const wav = new Blob([new Uint8Array(44)], {type: 'audio/wav'});
    expect(await api(fetch).speechToText(wav)).toBe('a dragon who loves pancakes');
    expect(`${calls[0].init.method} ${calls[0].url}`).toBe('POST http://api.test/speech-to-text');
    expect(header(calls[0].init, 'Content-Type')).toBe('audio/wav');
    expect(header(calls[0].init, 'Authorization')).toBe('Bearer dev-mia');
    expect(calls[0].init.body).toBe(wav);
  });

  it('passes on 413 when a recording is too long', async () => {
    const {fetch} = fakeFetch(json(413, {error: {code: 'too_large', message: 'At most 15 seconds'}}));
    await expect(api(fetch).speechToText(new Blob([]))).rejects.toMatchObject({status: 413});
  });

  it('fetches the push key, and sends a subscription in (POST) and out (DELETE with the endpoint)', async () => {
    const {fetch, calls} = fakeFetch(json(200, {publicKey: 'BKey'}), new Response(null, {status: 201}), new Response(null, {status: 204}));
    const client = api(fetch);
    expect(await client.pushKey()).toBe('BKey');
    await client.addPushSubscription({endpoint: 'https://push.example/1', keys: {p256dh: 'p', auth: 'a'}});
    await client.removePushSubscription({endpoint: 'https://push.example/1'});
    expect(calls.map(call => `${call.init.method} ${call.url}`)).toEqual([
      'GET http://api.test/push/key',
      'POST http://api.test/push/subscriptions',
      'DELETE http://api.test/push/subscriptions',
    ]);
    expect(JSON.parse(calls[2].init.body as string)).toEqual({endpoint: 'https://push.example/1'});
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
