// Maintenance service (spec §37–§45, §102).
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const TTL = 30 * 1000 // maintenance summary — short cache

// getMaintenance(carId?, status?) -> issues (spec §42). status: 'open' | 'resolved'.
// Cache key matches fleet.getCarMaintenance so a per-car view and the overview reuse it.
export async function getMaintenance({ carId, status } = {}, { force } = {}) {
  return cachedRequest(
    'maint:' + (carId || 'all') + ':' + (status || 'all'),
    TTL,
    async () => {
      const data = await api('getMaintenance', { carId, status })
      return data?.maintenance || []
    },
    { force }
  )
}

// A maintenance write can flip a car's status too, so clear both caches.
function invalidateMaintenance() {
  invalidatePrefix('maint')
  invalidatePrefix('cars')
  invalidatePrefix('car:')
}

// Report a new issue (spec §37). reporter + timestamp set server-side.
export async function reportIssue(issue) {
  const res = await api('reportIssue', { issue })
  invalidateMaintenance()
  return res
}

// Resolve an issue — admin only (spec §43).
export async function resolveIssue(payload) {
  const res = await api('resolveIssue', payload)
  invalidateMaintenance()
  return res
}
