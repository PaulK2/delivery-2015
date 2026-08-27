// Locations service (spec §56, §74).
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const TTL = 5 * 60 * 1000 // locations rarely change — cache for several minutes

// Keyed 'locations' (active only) / 'locations:all' so the Home map, Schedule page and
// admin screens share one cached fetch instead of each requesting it independently.
export async function getLocations({ includeInactive, force } = {}) {
  const key = includeInactive ? 'locations:all' : 'locations'
  return cachedRequest(
    key,
    TTL,
    async () => {
      const data = await api('getLocations', includeInactive ? { includeInactive: true } : {})
      return data?.locations || []
    },
    { force }
  )
}

// Admin: create or update a work location (spec §74).
export async function saveLocation(location) {
  const res = await api('saveLocation', { location })
  invalidatePrefix('locations')
  return res
}
