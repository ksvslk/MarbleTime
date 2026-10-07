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
      data,
      // One notification per claim: a repeat replaces it, and still makes a sound.
      tag: data.claimId ?? 'marbletime',
      renotify: true,
    }),
  );
});

// Tapping a notification brings MarbleTime to the front (or opens it) on the page it points to.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/', self.location.origin);
  // Only this app's own pages, whatever the message says.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
      const open = windows.find(client => new URL(client.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      // navigate() works only for pages this worker controls; otherwise the app is at least in front.
      if (open.url !== url) await open.navigate(url).catch(() => undefined);
    })(),
  );
});
