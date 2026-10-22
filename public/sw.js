// Offline: everything the page needs is cached at install, as one version, and served from that
// cache. A new build is a new sw.js (VERSION and SHELL are stamped by vite.config.js), so the
// browser installs the new version beside the old one, with the new page and its scripts
// together; the old cache is dropped when it activates, and the next open is the new version.
//
// Why no background refresh of the page (performance audit, round 1b): refreshing './' into the
// running cache stored a new index.html whose scripts that cache did not have, and the next
// offline open was a blank page. Hashed assets never change under the same name, so they are
// never refetched either. Other origins are never touched (the relays are WebSockets anyway).
const VERSION = '__BUILD__';
// The origin vdm285.github.io is shared (the owner's other projects, and until 2026-10-22 this app
// at /listolista/), and caches belong to the origin, not to a path: this worker's caches carry its
// scope, and it deletes only its own older versions, never another path's.
const SCOPE = new URL('./', location.href).pathname;
const CACHE = `papelito:${SCOPE}:${VERSION}`;
const SHELL = /*__SHELL__*/[];

self.addEventListener('install', (e) => {
  // asked of the server, never of the browser's HTTP cache: Pages lets a browser reuse a file for ten
  // minutes, and a page from before a deploy stored here names scripts this version does not have
  // (a blank page). "no-cache" revalidates (Pages changes every ETag on a deploy, so an install
  // downloads the shell once, as it did whenever the visit came more than ten minutes later).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      // papelito-<version>: the names used before 2026-10-22, only ever at /listolista/, which now forwards here
      if ((k.startsWith(`papelito:${SCOPE}:`) && k !== CACHE) || k.startsWith('papelito-')) await caches.delete(k);
    }
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
    // a navigation always gets this version's page (with or without ?lang= or #k=)
    const cached = await cache.match(nav ? './' : req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // something this version did not list (rare): keep it, but never a page in place of a file
      const type = res.headers.get('content-type') || '';
      if (!nav && res.ok && res.type === 'basic' && !type.includes('text/html')) cache.put(req, res.clone());
      return res;
    } catch {
      // offline: the page for a navigation, an honest failure for anything else (an HTML page
      // answering a script request is what broke the offline start)
      return nav ? (await cache.match('./')) || Response.error() : Response.error();
    }
  })());
});
