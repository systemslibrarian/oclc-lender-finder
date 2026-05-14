/* Lender Finder service worker — offline shell cache */
const CACHE = 'lender-finder-v14';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './lenders-directory.json',
  './lvis-policies.json',
  './film-policies.json',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Don't intercept backend proxy calls — those need to be live
  if (url.pathname.startsWith('/api/')) return;

  // Don't intercept cross-origin (Leaflet CDN, OSM tiles) — let the browser handle them
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for our shell
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
