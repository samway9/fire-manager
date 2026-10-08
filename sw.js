// Offline support: the whole app is cached on the phone. Bump VERSION when any file changes.
const VERSION = 'fire-0e0c0430f2';
const FILES = ['./', './index.html', './style.css', './app.js', './core.js', './views.js', './vendor/chart.umd.js',
               './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // FX API etc. go straight to the network
  if (url.pathname.endsWith('/price.json')) return;                            // always fresh, never cached
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request)));
});
