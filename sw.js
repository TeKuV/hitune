// Garde l'app et three.js en cache : l'app s'ouvre sans reseau, le Bluetooth n'en a pas besoin.
const CACHE = 'hitune-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'headset.js', 'protocol.js', 'model3d.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Reseau d'abord pour l'app (mises a jour visibles tout de suite), cache en secours ; cache d'abord pour three.js (version figee).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') {
    return;
  }
  const url = new URL(e.request.url);
  const pinned = url.hostname === 'cdn.jsdelivr.net';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (pinned) {
      const hit = await cache.match(e.request);
      if (hit) {
        return hit;
      }
    }
    try {
      const res = await fetch(e.request);
      if (res.ok && (pinned || url.origin === location.origin)) {
        cache.put(e.request, res.clone());
      }
      return res;
    } catch {
      return (await cache.match(e.request)) ?? Response.error();
    }
  })());
});
