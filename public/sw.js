// Offline: answer from the cache first, refresh it in the background (a new version shows on the
// next open). Fixes from docs/research/2026-10-21-pwa.md §5: keep the refresh alive with
// waitUntil, revalidate past GitHub Pages' 10-minute HTTP cache, fall back to the app for any
// navigation when offline, and never touch other origins (the relays are WebSockets anyway).
const VERSION = '__BUILD__';
const CACHE = `papelito-${VERSION}`;
const SHELL = /*__SHELL__*/[];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('papelito-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location.href).pathname)) return;
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = nav ? './' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    });
    e.waitUntil(fresh.catch(() => {}));
    if (cached) return cached;
    try { return await fresh; } catch { return (await cache.match('./')) || Response.error(); }
  })());
});
