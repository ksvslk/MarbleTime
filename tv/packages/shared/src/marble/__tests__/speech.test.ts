import {Sound} from '../sound';
import {Speech} from '../speech';

const answer = (url: string) => ({status: 200, ok: true, text: async () => JSON.stringify({audioUrl: url, durationMs: 900, mouth: {stepMs: 40, open: [0.5]}}), headers: {get: () => null}});

describe('read-aloud: recorded phrases, and the narrator for a family\'s own words', () => {
  const backend = {base: 'http://api', token: 't'};
  let speak: jest.SpyInstance;
  let enqueue: jest.SpyInstance;
  const original = global.fetch;
  beforeEach(() => {
    speak = jest.spyOn(Sound, 'speak').mockImplementation(() => {});
    enqueue = jest.spyOn(Sound, 'enqueue').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = original;
  });

  it('says them in order: a recorded phrase first, then the narrator\'s line, then the next phrase', async () => {
    global.fetch = jest.fn(async () => answer('https://cdn/n1.wav')) as unknown as typeof fetch;
    await Speech.say('en', ['Yay!', 'Polish the moon: done! – Isa', 'Thank you!'], backend);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(typeof speak.mock.calls[0][0][0]).not.toBe('string'); // the recorded "Yay!"
    expect(enqueue.mock.calls.map(c => c[0][0])).toEqual(['https://cdn/n1.wav', expect.anything()]);
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toBe(JSON.stringify({text: 'Polish the moon: done! – Isa', lang: 'en'}));
  });

  it('skips a line the backend can\'t give, and an unpaired TV only says recorded phrases', async () => {
    global.fetch = jest.fn(async () => ({status: 503, ok: false, text: async () => JSON.stringify({error: {code: 'unavailable', message: 'x'}}), headers: {get: () => null}})) as unknown as typeof fetch;
    await Speech.say('en', ['Great job, Kärt!', 'A grown-up will check.'], backend);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
    speak.mockClear();
    await Speech.say('en', ['Polish the moon'], undefined);
    expect(speak).not.toHaveBeenCalled();
  });

  it('a newer line wins: the older one is dropped when it arrives late', async () => {
    let release: (v: unknown) => void = () => {};
    global.fetch = jest.fn(() => new Promise(resolve => (release = resolve))) as unknown as typeof fetch;
    const first = Speech.say('en', ['Polish the moon'], backend);
    await Speech.say('en', ['Yay!'], backend); // the D-pad moved on
    release(answer('https://cdn/late.wav'));
    await first;
    expect(enqueue).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
