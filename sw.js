// Service worker: rende Flowa installabile e utilizzabile anche offline.
// Quando modifichi i file dell'app, aumenta VERSION (e anche APP_VERSION in app.js e version.json).
const VERSION = 'flowa-1';
const SHELL = ['./', 'index.html', 'assets/css/app.css', 'assets/js/app.js', 'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('version.json')) return; // sempre dalla rete
    // Prima la rete (così gli aggiornamenti arrivano subito), la copia salvata se sei offline.
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
    );
    return;
  }
  // Font: copia salvata, aggiornata in background.
  if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Tutto il resto (GitHub per i dati) passa direttamente dalla rete.
});
