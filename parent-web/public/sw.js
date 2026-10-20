// MarbleTime's service worker: notifications only (a kid says "I did it!").
// There is no fetch handler and no cache on purpose: the browser loads the app from the network as usual,
// so a new deploy reaches phones at once. A new version of this file takes over right away.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// The server sends JSON: {"title": "Mia: Toys away is done", "body": "+10 min · tap to answer",
// "data": {"url": "/", "claimId": "…"}} (POST /push/subscriptions in backend/openapi.yaml).
function readMessage(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return {body: event.data.text()};
  }
}

self.addEventListener('push', event => {
  const message = readMessage(event);
  const data = message.data ?? {};
  event.waitUntil(
    self.registration.showNotification(message.title || 'MarbleTime', {
      body: message.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      // "Yes" and "Not yet", answered right here (below) with the pass the message carries.
      actions: Array.isArray(message.actions) ? message.actions.slice(0, 2) : [],
      data,
      // One notification per claim: a repeat replaces it, and still makes a sound.
      tag: data.claimId ?? 'marbletime',
      renotify: true,
    }),
  );
});

// Where the API is: the page says so when it registers this worker (/sw.js?api=…), since a worker has no config of its own.
const API = new URL(self.location.href).searchParams.get('api') ?? '';

/** Brings MarbleTime to the front (or opens it) on one of its own pages, whatever the message says. */
async function openApp(path) {
  const target = new URL(path ?? '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
  const open = windows.find(client => new URL(client.url).origin === self.location.origin);
  if (!open) return self.clients.openWindow(url);
  await open.focus();
  // navigate() works only for pages this worker controls; otherwise the app is at least in front.
  if (open.url !== url) await open.navigate(url).catch(() => undefined);
}

/** "Yes" or "Not yet" from the notification: POST /push/decisions with the single-use pass (backend/openapi.yaml). */
async function answer(token, yes) {
  const response = await fetch(`${API}/push/decisions`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token, yes})});
  if (!response.ok) throw new Error(`answer refused: ${response.status}`);
}

// A tap on the notification opens the page where jobs are approved; a tap on "Yes" or "Not yet" answers at once,
// without opening anything. If the answer can't be given (no network, the pass is used or too old), the app opens
// so the grown-up can answer there.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const decided = event.action === 'yes' || event.action === 'not_yet';
  event.waitUntil(decided && data.token && API ? answer(data.token, event.action === 'yes').catch(() => openApp(data.url)) : openApp(data.url));
});
