const CACHE_NAME = 'binbuilder-v13';
const PRECACHE = [
  './',
  'index.html',
  'css/app.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/version.js',
  'js/utils.js',
  'js/db.js',
  'js/audio.js',
  'js/camera.js',
  'js/qr-scan.js',
  'js/ocr.js',
  'js/item-ocr.js',
  'js/thumbnails.js',
  'js/signature.js',
  'js/live-capture.js',
  'js/blur.js',
  'js/export-import.js',
  'js/views/home.js',
  'js/views/log-bin.js',
  'js/views/bin-list.js',
  'js/views/bin-detail.js',
  'js/views/search.js',
  'js/views/settings.js',
  'vendor/idb/index.js',
  'vendor/jsqr/jsQR.js',
  'vendor/jszip/jszip.min.js',
  'vendor/tesseract/tesseract.esm.min.js',
  'vendor/tesseract/worker.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname.includes('tesseract') || url.hostname.includes('unpkg') || url.hostname.includes('jsdelivr')) {
      event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(request);
          if (cached) return cached;
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        }),
      );
    }
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok && url.pathname.startsWith('/')) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    }),
  );
});