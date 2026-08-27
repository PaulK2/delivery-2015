// Lightweight in-memory cache + in-flight request de-duplication for shared read
// resources (employees, locations, cars, schedule, maintenance, history).
//
// Goals (per performance spec):
//   - never fetch the same data twice while a request is already in flight;
//   - reuse recently-loaded data within a short TTL so navigation feels instant;
//   - support stale-while-revalidate: a background refresh passes { force:true } to
//     bypass the TTL and update the cache, while initial/navigation reads use the
//     cached value.
//
// This is a read cache only. Writes never go through it, and mutations call
// invalidate()/invalidatePrefix() so the next read re-fetches from the backend, which
// stays the single source of truth. Auth results are intentionally NOT cached here.

const store = new Map() // key -> { value, expires }
const inflight = new Map() // key -> Promise

export function peekCached(key) {
  // Return the last known value ignoring TTL (for stale-while-revalidate reads).
  const entry = store.get(key)
  return entry ? entry.value : undefined
}

function getFresh(key) {
  const entry = store.get(key)
  if (entry && entry.expires > Date.now()) return entry.value
  return undefined
}

// Resolve `key` through the cache. If a matching request is already running, its
// promise is reused (dedupe). Otherwise a fresh (non-expired) cached value is returned
// unless `force` is set, in which case the fetcher runs and refreshes the cache.
export async function cachedRequest(key, ttlMs, fetcher, { force = false } = {}) {
  const pending = inflight.get(key)
  if (pending) return pending // coalesce identical concurrent requests

  if (!force) {
    const fresh = getFresh(key)
    if (fresh !== undefined) return fresh
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs })
      inflight.delete(key)
      return value
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, promise)
  return promise
}

export function invalidate(key) {
  store.delete(key)
}

export function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

// Drop everything (e.g. on logout) so a different session never sees cached data.
export function invalidateAll() {
  store.clear()
  inflight.clear()
}
