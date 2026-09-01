// Shared helpers — direct ports of the Apps Script utilities in backend/Backend.gs,
// rewritten against Web APIs (no Utilities/SpreadsheetApp in a Worker runtime).

export const TIMEZONE = 'Europe/Sofia'

function partsInTZ(date, timeZone, opts) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).formatToParts(date)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  return map
}

// yyyy-MM-ddTHH:mm:ss in Europe/Sofia — matches Backend.gs's nowStamp().
export function nowStamp() {
  const p = partsInTZ(new Date(), TIMEZONE, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`
}

// yyyy-MM-dd in Europe/Sofia — matches Backend.gs's dateOnly().
export function dateOnly(date) {
  const p = partsInTZ(date, TIMEZONE, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

// Normalize any date-ish value to a yyyy-MM-dd string. Unlike Apps Script (where Sheets
// auto-coerces stored dates into Date cells), D1 only ever stores/returns the TEXT we
// wrote — so this mainly normalizes client-supplied values.
export function normalizeIsoDate(value) {
  if (value === '' || value == null) return ''
  if (value instanceof Date) return dateOnly(value)
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) return dateOnly(d)
  return s
}

// Monday (yyyy-MM-dd) of the ISO week containing `iso`. Pure UTC calendar math —
// independent of any runtime timezone, matches the frontend's week_start convention.
export function mondayOfISO(iso) {
  const s = normalizeIsoDate(iso)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return s
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const wd = d.getUTCDay() // 0=Sun..6=Sat
  const diff = wd === 0 ? -6 : 1 - wd
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Monday of NEXT week, in Sofia time (yyyy-MM-dd).
export function nextMondayISO() {
  const todayIso = dateOnly(new Date())
  const d = new Date(todayIso + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun..6=Sat
  const diff = day === 0 ? 1 : 8 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Default-true booleans (matches Backend.gs's normalizeBoolean): an empty/unset cell
// reads as true; only an explicit false-ish value flips it.
export function normalizeBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  const str = String(value).toLowerCase().trim()
  return !(str === 'false' || str === '0' || str === 'no' || str === 'не')
}

// Strict truthiness (matches Backend.gs's isConfiguredFlag/strictBool): a blank/unset
// value reads as false. Used for paid/received/password_configured flags.
export function strictBool(value) {
  if (value === true) return true
  const s = String(value).toLowerCase().trim()
  return s === 'true' || s === '1' || s === 'yes' || s === 'да'
}

export function toNumberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

export function genId(prefix) {
  return prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function newToken() {
  return crypto.randomUUID() + crypto.randomUUID()
}

// Space/case-insensitive name key (mirrors the frontend's nameKey / Backend.gs's
// nameKeyBG), so "В. ПЕТКОВ" matches "В.ПЕТКОВ" regardless of spacing/case.
export function nameKeyBG(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

// Bulgarian plates share letters between Cyrillic and Latin — fold the look-alike
// Cyrillic letters to their Latin twin so both forms compare equal.
const CYRILLIC_TO_LATIN = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H',
  О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
}
export function normalizePlate(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[А-Я]/g, (ch) => CYRILLIC_TO_LATIN[ch] || ch)
}
