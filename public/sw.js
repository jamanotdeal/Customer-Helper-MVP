// ─── Jamanot PWA Service Worker ───────────────────────────────────────────────
// Handles: caching, FCM background push messages, notification clicks.
// Cache version — bump this string to force update on all clients.
const CACHE_NAME = 'jamanot-pwa-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/pwa-logo.png',
  '/Jamanot-Logo.png'
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch (Offline Cache) ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((res) => res || caches.match('/'))
    )
  );
});

// ─── Firebase Cloud Messaging (Background Push) ───────────────────────────────
// Import Firebase compat scripts so FCM push events are received even when
// the app is closed or backgrounded (Android, Desktop, iOS 16.4+ PWA).
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyDSN_Q5PTgnL7nTm0Ni1yktCculx6jlRYY',
    authDomain: 'jamanot-pwa.firebaseapp.com',
    projectId: 'jamanot-pwa',
    storageBucket: 'jamanot-pwa.firebasestorage.app',
    messagingSenderId: '685363529279',
    appId: '1:685363529279:web:fcdd94d0e5181b7b4b9a8a',
  });

  const messaging = firebase.messaging();

  // Handle background FCM messages (app closed or backgrounded).
  // FCM delivers a push event; we display a native notification.
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] FCM background message received:', payload);

    const title = payload.notification?.title || payload.data?.title || 'Jamanot';
    const body  = payload.notification?.body  || payload.data?.body  || '';
    const icon  = payload.notification?.icon  || '/Jamanot-Logo.png';
    const tag   = payload.data?.tag           || `fcm-${Date.now()}`;
    const url   = payload.data?.url           || '/';

    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/Jamanot-Logo.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url },
      actions: [{ action: 'open', title: 'Open Jamanot' }],
    });
  });

  console.log('[SW] Firebase Messaging initialized successfully.');
} catch (e) {
  // FCM scripts unavailable (e.g. offline during install) — fall back to
  // the manual push handler below. In-app notifications still work.
  console.warn('[SW] FCM init skipped:', e && e.message);
}

// ─── Manual Push Fallback ────────────────────────────────────────────────────
// Handles push events sent via the raw Web Push Protocol (non-FCM).
// Also used as a safety fallback if FCM importScripts above fails.
self.addEventListener('push', (event) => {
  // If FCM is active it handles its own push events; this covers the rest.
  let data = { title: 'Jamanot Update', body: 'You have a new update.', url: '/', tag: 'jamanot' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/Jamanot-Logo.png',
      badge: '/Jamanot-Logo.png',
      tag: data.tag || 'jamanot-notification',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: data.url || '/' },
      actions: [{ action: 'open', title: 'Open Jamanot' }],
    })
  );
});

// ─── postMessage from App → SW ───────────────────────────────────────────────
// When the app is in the foreground and wants the SW to show a notification
// (e.g. as a fallback when Notification API is restricted).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url, icon } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'Jamanot', {
        body: body || '',
        icon: icon || '/Jamanot-Logo.png',
        badge: '/Jamanot-Logo.png',
        tag: tag || `notif-${Date.now()}`,
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { url: url || '/' },
        actions: [{ action: 'open', title: 'Open Jamanot' }],
      })
    );
  }
});

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
