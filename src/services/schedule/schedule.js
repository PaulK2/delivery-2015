// Schedule service. Reads schedule + locations from the backend and normalizes
// the schedule through the isolated parser (spec §11–§16, §100).
import { api } from '../api/client.js'
import { normalizeSchedule } from './parser.js'

// Returns normalized schedule entries. The backend returns raw rows from the
// configured Google Sheet; parsing/normalization happens here, client-side and
// isolated, so the sheet format can evolve without touching UI code.
export async function getSchedule() {
  const data = await api('getSchedule', {})
  return normalizeSchedule(data?.rows || [])
}

export async function refreshSchedule() {
  const data = await api('refreshSchedule', {})
  return normalizeSchedule(data?.rows || [])
}

// Admin: configure the schedule source Google Sheet (spec §12).
export async function setScheduleSource(url) {
  return api('setScheduleSource', { url })
}

export async function getScheduleSource() {
  return api('getScheduleSource', {})
}

// Work locations with coordinates for the map (spec §56).
export async function getLocations() {
  const data = await api('getLocations', {})
  return data?.locations || []
}
