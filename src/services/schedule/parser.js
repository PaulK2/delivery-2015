// Schedule parser layer (spec §13, §14). Isolated on purpose: the raw Google Sheet
// format may change without touching UI components.
//
// The backend already reads the configured sheet and returns rows. This parser
// normalizes whatever shape they arrive in into the canonical schedule model:
//
//   { schedule_id, date, employee_id, employee_name,
//     location_id, location_name, shift_type, shift_start, shift_end }
//
// Allowed shift_type: 'full' | 'evening'.

import { CONFIG } from '../../config/index.js'

// Map free-text shift labels (as they may appear in the sheet) to internal values.
const SHIFT_ALIASES = {
  full: 'full',
  'цяла': 'full',
  'цяла смяна': 'full',
  'цял ден': 'full',
  'day': 'full',
  evening: 'evening',
  'вечер': 'evening',
  'вечерна': 'evening',
  'вечерна смяна': 'evening',
}

export function normalizeShiftType(raw) {
  if (!raw) return null
  const key = String(raw).trim().toLowerCase()
  return SHIFT_ALIASES[key] || (key === 'full' || key === 'evening' ? key : null)
}

// Normalize a single raw row (already keyed by our backend) into the canonical model.
// Returns null for rows that cannot be interpreted (skipped, not thrown).
export function normalizeRow(row, index) {
  if (!row) return null

  const shiftType = normalizeShiftType(row.shift_type ?? row.shift ?? row.type)
  if (!shiftType) return null

  const date = normalizeDate(row.date)
  if (!date) return null

  const shiftDef = CONFIG.shifts[shiftType]

  return {
    schedule_id: row.schedule_id || `SCH-${date}-${index}`,
    date,
    employee_id: row.employee_id || '',
    employee_name: (row.employee_name ?? row.person ?? '').toString().trim(),
    location_id: row.location_id || '',
    location_name: (row.location_name ?? row.restaurant ?? row.location ?? '').toString().trim(),
    shift_type: shiftType,
    shift_start: row.shift_start || shiftDef.start,
    shift_end: row.shift_end || shiftDef.end,
  }
}

// Normalize a whole set of raw rows into canonical entries, dropping invalid ones.
export function normalizeSchedule(rawRows) {
  if (!Array.isArray(rawRows)) return []
  const out = []
  rawRows.forEach((row, i) => {
    const norm = normalizeRow(row, i)
    if (norm && (norm.employee_name || norm.location_name)) out.push(norm)
  })
  return out
}

// Accepts YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY and returns YYYY-MM-DD, else null.
function normalizeDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()

  // already ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // DD.MM.YYYY or DD/MM/YYYY
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    return `${m[3]}-${mo}-${d}`
  }
  return null
}
