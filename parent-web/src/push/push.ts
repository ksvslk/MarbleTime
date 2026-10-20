/**
 * Notifications when a kid says "I did it!" (Web Push: GET /push/key, POST/DELETE /push/subscriptions).
 * public/sw.js shows them; this asks for permission and subscribes or unsubscribes this browser.
 */
import type {Api} from '../api/client';
import type {PushSubscriptionInput} from '../api/types';

/**
 * The service worker. It caches nothing, so a new deploy reaches phones right away. It is told where the API is in
 * its own address, so it can answer "Yes" / "Not yet" from a notification while the app is closed.
 */
export const swUrl = (apiBase: string) => `/sw.js?api=${encodeURIComponent(apiBase)}`;

/** What this browser can do: 'ok', or why not ('ios-home-screen': an iPhone needs MarbleTime on the Home Screen). */
export type PushSupport = 'ok' | 'ios-home-screen' | 'unsupported';
export type PushState = Exclude<PushSupport, 'ok'> | 'denied' | 'off' | 'on';

export interface BrowserFacts {
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** Push works only on https (and localhost): not on the LAN dev address. */
  secure: boolean;
  ios: boolean;
  /** Opened from the Home Screen. */
  standalone: boolean;
}

export function pushSupport(facts: BrowserFacts): PushSupport {
  if (facts.secure && facts.serviceWorker && facts.pushManager && facts.notification) return 'ok';
  // Safari on iPhone and iPad offers Web Push only to web apps opened from the Home Screen (iOS 16.4+).
  if (facts.ios && !facts.standalone) return 'ios-home-screen';
  return 'unsupported';
}

export function browserFacts(): BrowserFacts {
  const agent = navigator.userAgent;
  return {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    secure: window.isSecureContext,
    // iPadOS reports itself as a Mac, but a Mac has no touch screen.
    ios: /iPhone|iPad|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1),
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as {standalone?: boolean}).standalone === true,
  };
}

/** The server's VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

/** Whether a subscription was made with this key; after the server's key changes it must be made again. */
export function sameKey(current: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

/** The POST /push/subscriptions body from a browser subscription (its toJSON()); null without its keys. */
export function subscriptionPayload(json: PushSubscriptionJSON): PushSubscriptionInput | null {
  const {endpoint, keys} = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return {endpoint, keys: {p256dh: keys.p256dh, auth: keys.auth}};
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function send(api: Api, subscription: PushSubscription) {
  const payload = subscriptionPayload(subscription.toJSON());
  if (!payload) throw new Error('The browser gave a push subscription without keys');
  await api.addPushSubscription(payload);
}

/**
 * Where this browser stands. Already subscribed: send the subscription again, quietly, because the push
 * service can move it to a new endpoint and the server should have the current one.
 */
export async function currentPushState(api: Api): Promise<PushState> {
  const support = pushSupport(browserFacts());
  if (support !== 'ok') return support;
  if (Notification.permission === 'denied') return 'denied';
  const subscription = Notification.permission === 'granted' ? await existingSubscription() : null;
  if (!subscription) return 'off';
  void send(api, subscription).catch(() => undefined);
  return 'on';
}

/** A browser step that failed says which one it was (the browser's own messages don't). */
async function step<T>(name: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  }
}

/** Asks for permission, subscribes with the server's key and sends the subscription. */
export async function turnPushOn(api: Api): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await step('service worker', navigator.serviceWorker.register(swUrl(api.baseUrl), {updateViaCache: 'none'}));
  const registration = await step('service worker ready', navigator.serviceWorker.ready);
  const key = keyBytes(await api.pushKey());
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await step('push subscribe', registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key}));
  await send(api, subscription);
  return 'on';
}

/** Unsubscribes this browser. The server is told first (it needs the endpoint), but a failure there doesn't stop it. */
export async function turnPushOff(api: Api): Promise<PushState> {
  const subscription = await existingSubscription();
  if (subscription) {
    await api.removePushSubscription({endpoint: subscription.endpoint}).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return 'off';
}
