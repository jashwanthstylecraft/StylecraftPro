// Stylecraft Pro service worker: lets the app open without internet after the first visit.
// - Pages: network first, the last copy when offline.
// - Same-origin files (app code, catalog JSON, photos): served from the cache at once, refreshed in the background.
// - Other sites (Google Sheets, Apps Script, competitor photos) are never touched, so sign-in and syncing behave as normal.
// Raise CACHE when this file changes so old copies are removed.
const CACHE = 'stylecraft-pro-v2'
const SHELL = ['./', 'manifest.webmanifest', 'icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))   // a new version waits until the user taps UPDATE (see main.tsx)
})

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting() })

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res })
        .catch(() => caches.match('./').then(r => r || Response.error()))
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req)
      const refresh = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res })
        .catch(() => null)
      if (cached) { refresh.catch(() => null); return cached }
      return (await refresh) || Response.error()
    })
  )
})
