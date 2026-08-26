// Schedule parser layer (spec §13, §14). Isolated on purpose: the real management
// schedule is a wide weekly GRID, and this is the only place that knows its shape.
//
// Grid shape (delivery-2015 "График"):
//   Row 1: ДАТА + a location name at each block-start column
//          (ПИРИН, ГОЦЕ ДЕЛЧЕВ, ЧЕРКОВНА, СТУДЕНТСКИ ГРАД, СТУДЕНТСКИ ГРАД 2, МЛАДОСТ)
//   Row 2: repeated sub-headers per block — СЛУЖИТЕЛИ / СМЯНА / КОЛИ
//   Row 3+: day segments. Each calendar day is:
//            [ day-of-month number ] → full-shift rows
//            [ weekday name ]        → evening-shift rows
//          The final ОБЩО row holds weekly payment totals (skipped).
//
// СМЯНА is the shift PAYMENT (spec §57 shift_payment), not the shift type.
// Shift TYPE (full/evening) is derived from which block the row sits in.
//
// Output: normalized entries keyed by weekday (0=Sun..6=Sat), so the Home map can
// match "who works where on date X" purely by X's weekday — no month/year needed.

import { CONFIG } from '../../config/index.js'

// Bulgarian weekday name -> JS getDay() index (0=Sunday).
export const WEEKDAY_INDEX = {
  ПОНЕДЕЛНИК: 1,
  ВТОРНИК: 2,
  СРЯДА: 3,
  ЧЕТВЪРТЪК: 4,
  ПЕТЪК: 5,
  СЪБОТА: 6,
  НЕДЕЛЯ: 0,
}

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const isDayNumber = (s) => /^\d{1,2}$/.test(clean(s))
const weekdayIndexOf = (s) => WEEKDAY_INDEX[clean(s).toUpperCase()]

// Parse the raw 2D matrix (from getScheduleRaw) into normalized schedule entries.
export function parseScheduleMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 3) {
    return { entries: [], locationNames: [] }
  }

  // Row 0: locate each location block by its name column.
  const header = matrix[0]
  const blocks = []
  for (let c = 1; c < header.length; c++) {
    const name = clean(header[c])
    if (name && name.toUpperCase() !== 'ДАТА') {
      blocks.push({ name, empCol: c, payCol: c + 1, carCol: c + 2 })
    }
  }
  if (blocks.length === 0) return { entries: [], locationNames: [] }

  const entries = []
  let seg = null // current day segment: { dayNumber, weekday, phase }

  for (let r = 2; r < matrix.length; r++) {
    const row = matrix[r]
    const dateCell = clean(row[0])
    const firstEmp = clean(row[blocks[0].empCol])

    // Skip the weekly totals row.
    if (dateCell === 'ОБЩО' || firstEmp === 'ОБЩО') continue

    if (isDayNumber(dateCell)) {
      // A day-of-month number starts a new day's full-shift block.
      seg = { dayNumber: Number(dateCell), weekday: null, phase: 'full' }
    } else if (weekdayIndexOf(dateCell) !== undefined) {
      // The weekday label switches the same day into its evening block.
      if (seg) {
        seg.weekday = weekdayIndexOf(dateCell)
        seg.phase = 'evening'
      }
    }
    if (!seg) continue

    const shiftDef = CONFIG.shifts[seg.phase]
    for (const b of blocks) {
      const emp = clean(row[b.empCol])
      if (!emp || emp === 'ОБЩО') continue
      entries.push({
        schedule_id: `SCH-${seg.dayNumber}-${b.empCol}-${r}`,
        weekday: seg.weekday,
        day_number: seg.dayNumber,
        location_name: b.name,
        employee_name: emp,
        shift_type: seg.phase,
        shift_start: shiftDef.start,
        shift_end: shiftDef.end,
        payment: clean(row[b.payCol]),
        car: clean(row[b.carCol]),
      })
    }
  }

  // Full-shift rows appear before their weekday label, so their weekday is still
  // null. Backfill from the same day's evening rows (matched by day_number).
  const dayToWeekday = {}
  for (const e of entries) if (e.weekday != null) dayToWeekday[e.day_number] = e.weekday
  for (const e of entries) if (e.weekday == null) e.weekday = dayToWeekday[e.day_number] ?? null

  return { entries, locationNames: blocks.map((b) => b.name) }
}
