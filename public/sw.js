const CACHE = 'budgetku-family-v38-compact-health-assets';
const ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/navigation.js',
  '/pull-refresh.js',
  '/forms.js',
  '/cashflow.js',
  '/goal-math.js',
  '/goal-icons.js',
  '/components/transaction-dialog.js',
  '/views/dashboard.js',
  '/views/goals.js',
  '/views/settings.js',
  '/ui.js',
  '/exports.js',
  '/money.js',
  '/privacy.js',
  '/favicon.svg',
  '/logo.svg',
  '/manifest.webmanifest',
  '/fonts/IBMPlexSans-Regular.woff2',
  '/fonts/IBMPlexSans-Medium.woff2',
  '/fonts/IBMPlexSans-SemiBold.woff2',
  '/fonts/IBMPlexSans-Bold.woff2',
  '/fonts/IBMPlexMono-Regular.woff2',
  '/fonts/IBMPlexMono-Medium.woff2'
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map(async (asset) => {
      const response = await fetch(asset, { cache: 'no-cache' });
      if (response.ok) await cache.put(asset, response);
    }));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    ])
  );
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/') || u.pathname.startsWith('/receipts/')) return;
  e.respondWith(
    fetch(e.request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(e.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        if (e.request.mode === 'navigate') return (await caches.match('/index.html')) || Response.error();
        return Response.error();
      })
  );
});
