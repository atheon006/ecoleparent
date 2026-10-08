// Notifications push de l'espace parents sur le web (Firebase Cloud Messaging, sans bibliothèque).
// Le message arrive chiffré, le navigateur le déchiffre : on l'affiche tel quel.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const n = msg.notification || {};
  const link = (msg.fcmOptions && msg.fcmOptions.link) || n.click_action || '/';
  event.waitUntil(
    self.registration.showNotification(n.title || 'ParentEcole', {
      body: n.body || '',
      icon: n.icon || '/icon-192.png',
      tag: msg.fcmMessageId,
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow(link);
    })(),
  );
});
