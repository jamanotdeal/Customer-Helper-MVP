const CACHE_NAME = 'jamanot-pwa-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/Jamanot-Logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((res) => {
        if (res) return res;
        return caches.match('/');
      });
    })
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  let data = { title: 'Jamanot Update', body: 'You have a new update on your order.', url: '/' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/Jamanot-Logo.png',
    badge: '/Jamanot-Logo.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200, 100, 200],
    renotify: true,
    tag: data.tag || 'jamanot-notification',
    actions: [
      { action: 'open', title: 'Open Jamanot' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Client postMessage event for background system notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url, icon } = event.data;
    const options = {
      body: body || '',
      icon: icon || '/Jamanot-Logo.png',
      badge: '/Jamanot-Logo.png',
      tag: tag || `notif-${Date.now()}`,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: url || '/' },
      actions: [
        { action: 'open', title: 'Open Jamanot' }
      ]
    };
    event.waitUntil(
      self.registration.showNotification(title || 'Jamanot', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
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

