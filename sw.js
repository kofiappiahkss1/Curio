/**
 * Curio service worker — this is what makes the app work with no internet.
 * The whole app is cached on first visit; afterwards every request is served
 * from the phone. Network is only ever consulted to look for a newer version.
 */
const CACHE = 'curio-v9';
const SHELL = [
  './', './index.html', './app.html',
  './app.js', './core.js', './store.js', './i18n.js', './crypto.js', './backup.js', './share.js', './voice.js', './history.js', './storage.js', './profile.js', './holidays.js', './device.js', './meeting.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // The connectivity probe must actually touch the network, otherwise the
  // cache would answer it and the app would always believe it is online.
  if (new URL(req.url).searchParams.has('curio-ping')) return;

  // Share target posts land here as a navigation; let them through to index.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // refresh in the background, but never block on the network
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./app.html'));
    })
  );
});
