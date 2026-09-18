const CACHE = 'ych-pocket-v6';
const FILES = ['./', 'index.html', 'styles.css', 'ych-theme.css', 'toolbar.css', 'app.js', 'tilt.js', 'manifest.webmanifest', 'assets/ocean.svg', 'assets/sunset.svg', 'assets/space.svg', 'assets/icon.svg', 'assets/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('aqua-pocket-') || key.startsWith('ych-pocket-')) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
