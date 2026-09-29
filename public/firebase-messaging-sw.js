// Background push handler (service worker).
//
// Firebase config is injected at build time by scripts/generate-sw-config.mjs
// into /firebase-config.js. When keys are not yet configured that file sets
// FIREBASE_CONFIG = null and this worker stays idle — no errors, no push —
// until keys land and the next build re-injects them.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

try {
  importScripts('/firebase-config.js');
} catch (e) {
  // Config chunk missing (pre-build step didn't run) — stay idle.
}

if (self.FIREBASE_CONFIG) {
  firebase.initializeApp(self.FIREBASE_CONFIG);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || 'Kaveri Academy';
    const body = (payload.notification && payload.notification.body) || '';
    const link = (payload.fcmOptions && payload.fcmOptions.link) || '/notifications';
    self.registration.showNotification(title, {
      body,
      icon: '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg',
      tag: 'kaveri-lms',
      data: { link },
    });
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = (event.notification.data && event.notification.data.link) || '/notifications';
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(link);
            return client.focus();
          }
        }
        return self.clients.openWindow(link);
      }),
    );
  });
}
