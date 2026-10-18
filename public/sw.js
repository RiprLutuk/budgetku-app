const CACHE = 'budgetku-family-v24-compact-budget';
const ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/forms.js',
  '/cashflow.js',
  '/goal-math.js',
  '/components/transaction-dialog.js',
  '/views/dashboard.js',
  '/views/goals.js',
  '/views/settings.js',
  '/ui.js',
  '/money.js',
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/') || u.pathname.startsWith('/receipts/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
