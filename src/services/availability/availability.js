// Availability service (spec §17–§23).
import { api, ApiError } from '../api/client.js'
import { todayISO, weekdayIndex, shiftISO, toIsoDate } from '../../utils/datetime.js'

// Monday of next week, computed client-side (fallback + default).
export function nextMondayISO() {
  const t = todayISO()
  const wd = weekdayIndex(t) // 0=Sun..6=Sat
  const diff = wd === 0 ? 1 : 8 - wd
  return shiftISO(t, diff)
}

// The 7 ISO dates (Mon..Sun) of a week starting at weekStart (a Monday).
export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => shiftISO(weekStart, i))
}

// Read open/closed state + active week. Falls back gracefully if the backend
// action isn't deployed yet (older Backend.gs): assume open, next-Monday week.
export async function getAvailabilityStatus() {
  try {
    const data = await api('getAvailabilityStatus', {})
    return {
      open: !!data?.open,
      weekStart: data?.week_start || nextMondayISO(),
      fallback: false,
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_found') {
      return { open: true, weekStart: nextMondayISO(), fallback: true }
    }
    throw e
  }
}

// All availability rows for a week (team overview). We fetch everything and filter
// client-side after normalizing dates — robust to Sheets' date coercion and to
// backends that haven't been redeployed with the normalized filter yet.
export async function getAvailability(weekStart) {
  const data = await api('getAvailability', {})
  const rows = (data?.availability || []).map((r) => ({
    ...r,
    date: toIsoDate(r.date),
    week_start: toIsoDate(r.week_start),
  }))
  return weekStart ? rows.filter((r) => r.week_start === weekStart) : rows
}

// Save the current user's availability for the week.
// entries: [{ date, shiftType }] — 'none' entries are dropped server-side.
export async function saveAvailability(weekStart, entries) {
  return api('saveAvailability', { weekStart, entries })
}

// Admin: open/close the submission period.
export async function setAvailabilityOpen(open) {
  return api('setAvailabilityOpen', { open })
}

// Admin: set the active week (falls back to a no-op if not deployed).
export async function setAvailabilityWeek(weekStart) {
  return api('setAvailabilityWeek', { weekStart })
}
