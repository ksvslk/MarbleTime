import {describe, expect, it} from 'vitest';
import {keyBytes, pushSupport, sameKey, subscriptionPayload, swUrl, type BrowserFacts} from './push';

const facts = (overrides: Partial<BrowserFacts> = {}): BrowserFacts => ({
  serviceWorker: true,
  pushManager: true,
  notification: true,
  secure: true,
  ios: false,
  standalone: false,
  ...overrides,
});

describe('the notification worker', () => {
  it('is told where the API is in its own address, so it can answer from a notification with the app closed', () => {
    expect(swUrl('https://api.example.com')).toBe('/sw.js?api=https%3A%2F%2Fapi.example.com');
    expect(new URL(swUrl('https://192.168.0.102:5173/api'), 'https://192.168.0.102:5173').searchParams.get('api')).toBe('https://192.168.0.102:5173/api');
  });
});

describe('push support', () => {
  it('works with a service worker, push and notifications on https, also on an iPhone from the Home Screen', () => {
    expect(pushSupport(facts())).toBe('ok');
    expect(pushSupport(facts({ios: true, standalone: true}))).toBe('ok');
  });

  it('tells an iPhone in Safari to add MarbleTime to the Home Screen first', () => {
    expect(pushSupport(facts({ios: true, pushManager: false, notification: false}))).toBe('ios-home-screen');
  });

  it('is unsupported on plain http (the LAN dev address) or without the browser features', () => {
    expect(pushSupport(facts({secure: false, serviceWorker: false}))).toBe('unsupported');
    expect(pushSupport(facts({pushManager: false}))).toBe('unsupported');
    expect(pushSupport(facts({ios: true, standalone: true, pushManager: false}))).toBe('unsupported'); // iOS before 16.4
  });
});

describe('subscription', () => {
  it('sends the endpoint and both keys', () => {
    const json = {endpoint: 'https://push.example/abc', expirationTime: null, keys: {p256dh: 'BPkey', auth: 'Auth'}};
    expect(subscriptionPayload(json)).toEqual({endpoint: 'https://push.example/abc', keys: {p256dh: 'BPkey', auth: 'Auth'}});
  });

  it('refuses a subscription without its endpoint or keys', () => {
    expect(subscriptionPayload({endpoint: 'https://push.example/abc'})).toBeNull();
    expect(subscriptionPayload({endpoint: 'https://push.example/abc', keys: {p256dh: 'BPkey'}})).toBeNull();
    expect(subscriptionPayload({keys: {p256dh: 'BPkey', auth: 'Auth'}})).toBeNull();
  });

  it('decodes the server’s base64url key into the bytes the browser wants', () => {
    expect([...keyBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...keyBytes('-_8')]).toEqual([251, 255]); // base64url's - and _ are base64's + and /
    const vapidKey = Uint8Array.from({length: 65}, (_, i) => (i * 37) % 256); // a P-256 public key is 65 bytes
    expect(keyBytes(Buffer.from(vapidKey).toString('base64url'))).toEqual(vapidKey);
  });

  it('notices a subscription made with another key (it must be made again)', () => {
    const key = Uint8Array.from([1, 2, 3]);
    expect(sameKey(Uint8Array.from([1, 2, 3]).buffer, key)).toBe(true);
    expect(sameKey(Uint8Array.from([1, 2, 4]).buffer, key)).toBe(false);
    expect(sameKey(Uint8Array.from([1, 2]).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});
