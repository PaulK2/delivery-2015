// Service worker (spec §87).
//
// The app shell (HTML) is served NETWORK-FIRST so a new deployment is picked up
// immediately — falling back to cache only when offline. Hashed static assets
// (/assets/*) are immutable, so they stay cache-first. API calls go to a different
// origin (Apps Script) and are never cached here.
//
// Bumping CACHE purges the previous cache on activate, so an old shell can't linger.
const CACHE = 'avtopark-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // App shell / navigations: network-first (freshness wins), cache as offline fallback.
  const isHTML =
    req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(async () => (await caches.match(req)) || caches.match('/index.html'))
    )
    return
  }

  // Hashed static assets: cache-first with background refresh.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
