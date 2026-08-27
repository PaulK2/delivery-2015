// Locations service (spec §56, §74).
import { api } from '../api/client.js'

export async function getLocations({ includeInactive } = {}) {
  const data = await api('getLocations', includeInactive ? { includeInactive: true } : {})
  return data?.locations || []
}

// Admin: create or update a work location (spec §74).
export async function saveLocation(location) {
  return api('saveLocation', { location })
}
