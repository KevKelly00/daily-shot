const CACHE = 'crema-v4';

const STATIC = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/feed.html',
  '/library.html',
  '/log.html',
  '/log-detail.html',
  '/profile.html',
  '/pending.html',
  '/user.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/config.js',
  '/js/utils.js',
  '/js/dashboard.js',
  '/js/feed.js',
  '/js/library.js',
  '/js/log.js',
  '/js/log-detail.js',
  '/js/profile.js',
  '/js/user.js',
  '/manifest.json',
  '/icon.svg',
];

// Cache static assets on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for Supabase API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept CDN or Supabase API/auth — but DO cache Supabase storage images
  if (url.hostname.includes('jsdelivr')) return;
  if (url.hostname.includes('supabase') && !url.pathname.startsWith('/storage/v1/object/public/')) {
    return;
  }

  // Cache-first for same-origin requests
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
      return cached || network;
    })
  );
});
