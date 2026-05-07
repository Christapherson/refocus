// re:Focus Service Worker
// Cache-first for app shell; network-first for manifest updates.

const CACHE_NAME = 'refocus-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.filter(url => !url.includes('icon'))); // icons optional
    }).catch(err => {
      console.warn('[SW] Pre-cache failed (non-fatal):', err);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for same-origin, passthrough for CDN ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Let CDN requests (fonts, Tailwind, React, Babel) go straight to network.
  // They have their own long-lived caching headers.
  if (url.origin !== self.location.origin) {
    return; // browser handles it
  }

  // For manifest.json: network-first so updates propagate on next load
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: cache-first (app shell, index.html)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
