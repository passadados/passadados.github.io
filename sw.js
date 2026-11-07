// Service worker do passadados: deixa o app abrir offline.
// IMPORTANTE: a cada nova publicação, aumente o número da VERSÃO abaixo (v1 -> v2 ...).
// Assim os aparelhos baixam os arquivos novos e mostram o aviso "Nova versão disponível".
const VERSION = 'passadados-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/theme-init.js',
  './js/app.js',
  './js/backup.js',
  './js/cep.js',
  './js/crypto.js',
  './js/fields.js',
  './js/form.js',
  './js/lock.js',
  './js/profiles.js',
  './js/pwa.js',
  './js/settings.js',
  './js/share.js',
  './js/storage.js',
  './js/ui.js',
  './js/utils.js',
  './js/webauthn.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Só atende arquivos do próprio site. A consulta de CEP (viacep.com.br) passa direto, sem cache.
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
