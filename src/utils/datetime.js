// Date/time helpers. Everything is presented in Europe/Sofia local time (spec §64)
// using Bulgarian-friendly formats: DD.MM.YYYY and HH:mm (spec §65).

import { CONFIG } from '../config/index.js'

const TZ = CONFIG.timezone

// Returns an ISO date string (YYYY-MM-DD) for "today" in Sofia time.
export function todayISO() {
  return isoDateFromParts(new Date())
}

// Convert a Date to a YYYY-MM-DD string using Sofia calendar day.
export function isoDateFromParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// "2026-08-27" -> "27.08.2026"
export function formatDateBG(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

// Bulgarian weekday name for an ISO date. Uses midday to avoid DST edge cases.
const WEEKDAYS_BG = [
  'Неделя',
  'Понеделник',
  'Вторник',
  'Сряда',
  'Четвъртък',
  'Петък',
  'Събота',
]
export function weekdayBG(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return WEEKDAYS_BG[d.getDay()] || ''
}

// Shift an ISO date by a number of days (can be negative).
export function shiftISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoDateFromParts(d)
}

// Days remaining until an ISO date (from today, Sofia). Negative = expired.
export function daysUntil(iso) {
  if (!iso) return null
  const today = new Date(`${todayISO()}T12:00:00`)
  const target = new Date(`${iso}T12:00:00`)
  return Math.round((target - today) / 86400000)
}

// Current HH:mm in Sofia time.
export function nowTimeBG() {
  return new Intl.DateTimeFormat('bg-BG', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}
