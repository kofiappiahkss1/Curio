/**
 * Curio service worker.
 *
 * WHAT WENT WRONG BEFORE, AND HOW THIS FIXES IT
 *
 * The first version cached everything and served it cache-first, including the
 * app's own code. That is fine for icons and catastrophic for JavaScript: a new
 * version could be sitting on the server for days while the phone kept happily
 * serving the old one. Worse, the install used the browser's ordinary HTTP
 * cache, so even a fresh service worker could install stale files.
 *
 * The strategy now splits by what a thing actually is:
 *
 *   APP CODE   (html, js, css, manifest) — network first, cache as the safety
 *              net. Online you always get today's version; offline you get the
 *              last one that worked. This is the whole fix.
 *
 *   ASSETS     (icons, images) — cache first. They are large, they never
 *              meaningfully change, and re-fetching them is a waste.
 *
 * The install also fetches with `cache: 'reload'`, which goes past the browser's
 * HTTP cache and to the server, so a new version is genuinely new.
 */

const VERSION = 'v16';
const CODE_CACHE = `curio-code-${VERSION}`;
const ASSET_CACHE = `curio-assets-${VERSION}`;

const CODE = [
  './', './index.html', './app.html',
  './about.html', './privacy.html', './terms.html', './pages.css',
  './app.js', './core.js', './store.js', './i18n.js', './crypto.js', './backup.js',
  './share.js', './voice.js', './history.js', './storage.js', './profile.js',
  './holidays.js', './device.js', './meeting.js', './themes.js', './search.js',
  './book.js', './locks.js', './nutrition.js', './import.js',
  './manifest.webmanifest',
];

const ASSETS = [
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './icons/icon-maskable-512.png',
];

const isCode = (url) =>
  /\.(?:html|js|mjs|css|webmanifest|json)$/.test(url.pathname) ||
  url.pathname.endsWith('/') ||
  url.pathname === '';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // `cache: 'reload'` is the important part: go to the server, not the
    // browser's ten-minute HTTP cache, or a "new" version installs old files.
    const code = await caches.open(CODE_CACHE);
    await Promise.all(CODE.map((u) =>
      fetch(new Request(u, { cache: 'reload' }))
        .then((r) => (r.ok ? code.put(u, r) : null))
        .catch(() => null)));

    const assets = await caches.open(ASSET_CACHE);
    await Promise.all(ASSETS.map((u) =>
      assets.match(u).then((hit) => hit || fetch(u).then((r) => (r.ok ? assets.put(u, r) : null)).catch(() => null))));

    await self.skipWaiting();       // do not sit in "waiting" behind an old tab
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CODE_CACHE, ASSET_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* not everywhere */ }
    }
    await self.clients.claim();
    // tell every open tab which version is now in charge
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'curio-activated', version: VERSION }));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // never touch other origins

  // the connectivity probe must reach the network or the app cannot tell
  if (url.searchParams.has('curio-ping')) return;

  if (isCode(url)) {
    event.respondWith(networkFirst(req, event));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

/** Today's version when online; the last good one when not. */
async function networkFirst(req, event) {
  const cache = await caches.open(CODE_CACHE);
  try {
    const preload = event?.preloadResponse ? await event.preloadResponse : null;
    const fresh = preload || await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    }
    throw new Error('bad response');
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return (await cache.match('./app.html')) || (await cache.match('./index.html')) || Response.error();
    }
    return Response.error();
  }
}

/** Icons and pictures: from the cache, refreshed quietly in the background. */
async function cacheFirst(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) {
    fetch(req).then((r) => { if (r.ok) cache.put(req, r); }).catch(() => {});
    return hit;
  }
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return Response.error();
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg === 'skipWaiting' || msg?.type === 'skipWaiting') self.skipWaiting();
  if (msg?.type === 'version') {
    event.source?.postMessage({ type: 'curio-version', version: VERSION });
  }
});
