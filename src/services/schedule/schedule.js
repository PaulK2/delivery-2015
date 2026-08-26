// Schedule service. Reads the raw schedule matrix from the backend and normalizes
// it through the isolated parser (spec §11–§16, §100).
import { api } from '../api/client.js'
import { parseScheduleMatrix } from './parser.js'

// Returns { entries, locationNames, configured, sheetName }.
// The backend getScheduleRaw returns the full 2D grid (display values); parsing
// happens here, client-side and isolated, so the sheet format can change without
// touching UI code.
export async function getSchedule() {
  const data = await api('getScheduleRaw', {})
  if (!data || data.configured === false) {
    return { entries: [], locationNames: [], configured: false, sheetName: '' }
  }
  const { entries, locationNames } = parseScheduleMatrix(data.matrix || [])
  return { entries, locationNames, configured: true, sheetName: data.sheet_name || '' }
}

// Same read; the UI's explicit "refresh" button uses this name.
export const refreshSchedule = getSchedule

// Admin: configure the schedule source Google Sheet (spec §12).
export async function setScheduleSource(url, tabName) {
  return api('setScheduleSource', { url, tabName })
}

export async function getScheduleSource() {
  return api('getScheduleSource', {})
}

// Work locations with coordinates for the map (spec §56).
export async function getLocations() {
  const data = await api('getLocations', {})
  return data?.locations || []
}
