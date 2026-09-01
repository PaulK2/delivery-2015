// Schedule service. Reads the raw schedule matrix from the backend and normalizes
// it through the isolated parser (spec §11–§16, §100).
import { api } from '../api/client.js'
import { cachedRequest, invalidate } from '../api/cache.js'
import { parseScheduleMatrix } from './parser.js'

// One shared locations implementation — the map, schedule page and admin all reuse the
// same cached fetch (re-exported so existing imports from this module keep working).
export { getLocations } from '../locations/locations.js'

const SCHEDULE_TTL = 45 * 1000 // short cache; fetched + normalized once and reused

// Returns { entries, locationNames, configured, sheetName }.
// The backend getScheduleRaw returns the full 2D grid (display values); parsing happens
// here, client-side and isolated, so the sheet format can change without touching UI.
// Cached (and normalized) once so the Home map and Schedule page don't each re-download
// and re-parse the same weekly grid within a session.
export async function getSchedule({ force, serverRefresh } = {}) {
  return cachedRequest(
    'schedule',
    SCHEDULE_TTL,
    async () => {
      // Background polls (force) reuse the backend's short server cache; only an explicit
      // admin refresh (serverRefresh) tells the backend to re-read the external sheet.
      const data = await api('getScheduleRaw', serverRefresh ? { refresh: true } : {})
      if (!data || data.configured === false) {
        return { entries: [], locationNames: [], configured: false, sheetName: '' }
      }
      const { entries, locationNames } = parseScheduleMatrix(data.matrix || [])
      return { entries, locationNames, configured: true, sheetName: data.sheet_name || '' }
    },
    { force: force || serverRefresh }
  )
}

// The UI's explicit "refresh" button bypasses both the client and backend caches.
export function refreshSchedule() {
  return getSchedule({ serverRefresh: true })
}

// Admin: configure the schedule source Google Sheet (spec §12).
export async function setScheduleSource(url, tabName) {
  const res = await api('setScheduleSource', { url, tabName })
  invalidate('schedule')
  return res
}

export async function getScheduleSource() {
  return api('getScheduleSource', {})
}

/* ------------------------- schedule archive (admin) ------------------------- */
// A small rolling set of past schedule sheet links (e.g. the last ~4 weeks), so an old
// week's grid can still be looked up after the boss moves on to a new sheet. Entirely
// separate from the live source above — never affects the Home map or "current" view.

export async function getScheduleArchive() {
  const { archive } = await api('getScheduleArchive', {})
  return archive
}

export async function saveScheduleArchiveLink(link) {
  return api('saveScheduleArchiveLink', { link })
}

export async function deleteScheduleArchiveLink(archiveId) {
  return api('deleteScheduleArchiveLink', { archiveId })
}

// Fetches + parses one archived link's grid on demand. Returns the same shape as
// getSchedule() (entries/locationNames/configured) plus the link's label.
export async function getArchivedSchedule(archiveId, { refresh } = {}) {
  const data = await api('getArchivedScheduleRaw', { archiveId, refresh: refresh || undefined })
  const { entries, locationNames } = parseScheduleMatrix(data.matrix || [])
  return { entries, locationNames, label: data.label || '' }
}
