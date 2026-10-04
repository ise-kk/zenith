// Offline support: always try the network first (so updates show up right away),
// fall back to the last cached copy when offline.
const CACHE = 'zenith-v39';
const FONT = 'zenith-font-v3'; // fonts never change under the same name: cache first, kept across versions
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// also kept for offline first use (hills, campsites); a failure here must not block the install
const EXTRA = ['topics.json', 'trains.json', 'tle.txt'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => Promise.all(EXTRA.map(u => c.add(u).catch(() => {}))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zenith-') && k !== CACHE && k !== FONT).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/fonts\/[^/]+\.woff2$/.test(url.pathname)) {
    e.respondWith(caches.open(FONT).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
