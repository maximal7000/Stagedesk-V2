/**
 * Stagedesk Service Worker — sehr leichter App-Shell-Cache.
 *
 * Strategie:
 *  - HTML-Navigation: network-first (immer aktuelle App), Fallback Cache
 *  - Statische Vite-Assets (/assets/*): cache-first (sind hashed)
 *  - API-Calls (/api/*): NICHT gecacht — immer Network. Token-sensible Daten.
 *
 * Cache-Versionierung: bei Inhaltsänderung CACHE-Namen erhöhen.
 */
const CACHE = 'stagedesk-v1';
const APP_SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// ── Web-Push ──────────────────────────────────────────────────────
// Backend sendet Payload als JSON {title, body, url}.
self.addEventListener('push', (event) => {
  let data = { title: 'Stagedesk', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    // existierendes Tab fokussieren wenn möglich, sonst neues öffnen
    for (const c of clients) {
      if ('focus' in c) { c.navigate(url); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API + WebSocket-Upgrades nicht gecacht.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  // Hashed Vite-Assets: cache-first, write-through.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Navigation/HTML: network-first, fallback Cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/') || caches.match(req)),
    );
  }
});
