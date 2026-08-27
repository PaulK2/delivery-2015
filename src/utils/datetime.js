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

// JS getDay() index (0=Sunday) for an ISO date. Used to match schedule entries,
// which are keyed by weekday rather than calendar date.
export function weekdayIndex(iso) {
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).getDay()
}

// Bulgarian weekday name from a JS getDay() index (0=Sunday).
export function weekdayNameByIndex(idx) {
  return WEEKDAYS_BG[idx] || ''
}

// Day-of-month (1–31) for an ISO date — matches the schedule grid's day numbers.
export function dayOfMonth(iso) {
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).getDate()
}

// The management schedule grid tags each entry with its day-of-month AND weekday, so an
// entry belongs to a calendar date only when BOTH match. Matching this way (instead of
// by weekday alone) means viewing a week the sheet doesn't cover yields no entries —
// the schedule shows empty for unconfigured future weeks rather than repeating this week.
export function scheduleEntriesForDate(entries, iso) {
  if (!iso || !Array.isArray(entries)) return []
  const dom = dayOfMonth(iso)
  const wd = weekdayIndex(iso)
  return entries.filter((e) => Number(e.day_number) === dom && e.weekday === wd)
}

// Reconstruct the calendar date (ISO) for a schedule weekday + day-of-month, picking the
// occurrence nearest today. Lets the schedule page show a real date beside each weekday
// even though the grid itself only carries a day number. '' when none is nearby.
export function scheduleDate(weekday, dayNumber) {
  if (weekday == null || dayNumber == null || dayNumber === '') return ''
  const dom = Number(dayNumber)
  const today = new Date(`${todayISO()}T12:00:00`)
  for (let offset = -10; offset <= 28; offset++) {
    const d = new Date(today)
    d.setDate(d.getDate() + offset)
    if (d.getDay() === weekday && d.getDate() === dom) return isoDateFromParts(d)
  }
  return ''
}

// Monday-first ordering of getDay() indices, for weekly views.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

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

// Backend timestamps come in two shapes: a naive "YYYY-MM-DDTHH:mm:ss" (already
// Sofia local, e.g. from takeCar's response) and a real UTC instant with a
// timezone marker "...Z" (Google Sheets coerces stored strings to datetimes, so
// history reads back as UTC). Resolve both into Sofia-local parts.
function sofiaParts(stamp) {
  const s = String(stamp)
  // Has timezone info -> a real instant; convert to Sofia.
  if (/([Zz]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: TZ,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
          .formatToParts(d)
          .map((x) => [x.type, x.value])
      )
      return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute }
    }
  }
  // Naive local timestamp.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (m) return { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] }
  return null
}

// Format a backend timestamp as "DD.MM.YYYY HH:mm" in Sofia local time.
export function formatStampBG(stamp) {
  if (!stamp) return ''
  const p = sofiaParts(stamp)
  return p ? `${p.d}.${p.mo}.${p.y} ${p.h}:${p.mi}` : String(stamp)
}

// Just the HH:mm part of a backend timestamp, in Sofia local time.
export function stampTime(stamp) {
  if (!stamp) return ''
  const p = sofiaParts(stamp)
  return p ? `${p.h}:${p.mi}` : ''
}

// Sofia-local calendar date (YYYY-MM-DD) of a backend timestamp — for filtering.
export function stampDateISO(stamp) {
  if (!stamp) return ''
  const p = sofiaParts(stamp)
  return p ? `${p.y}-${p.mo}-${p.d}` : ''
}

// Normalize any date-ish value (plain YYYY-MM-DD, DD.MM.YYYY, or a UTC ISO stamp
// that Sheets produced by coercing a date cell) to a Sofia-local YYYY-MM-DD.
export function toIsoDate(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const bg = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (bg) return `${bg[3]}-${bg[2]}-${bg[1]}`
  const iso = stampDateISO(s)
  return iso || s.slice(0, 10)
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
