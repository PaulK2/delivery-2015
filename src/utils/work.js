// Shared work/payroll helpers built on the parsed schedule (Major Feature Update).
// The schedule is keyed by employee NAME; orders/fuel/payroll are keyed by employee_id,
// so callers join the two by name where needed.
import { scheduleEntriesForDate, shiftISO } from './datetime.js'
import { parsePayment, isOwnCarAssignment } from './shifts.js'
import { CONFIG } from '../config/index.js'

export const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

// The 7 ISO dates (Mon..Sun) of the week starting at `weekStart`.
export function weekDatesISO(weekStart) {
  return Array.from({ length: 7 }, (_, i) => shiftISO(weekStart, i))
}

// The user's schedule entry for a given date (first match), or null.
export function myShiftForDate(entries, userName, dateISO) {
  const key = nameKey(userName)
  return scheduleEntriesForDate(entries || [], dateISO).find(
    (e) => nameKey(e.employee_name) === key
  ) || null
}

// Pay for a single schedule entry: the СМЯНА payment plus the own-car bonus when the own
// car is assigned. 0 for a blank/unparseable payment.
export function entryPay(entry) {
  if (!entry) return 0
  const base = parsePayment(entry.payment)
  if (base == null) return 0
  return base + (isOwnCarAssignment(entry.car) ? CONFIG.ownCar.payBonus : 0)
}

// Base weekly salary for one worker: sum of pay over their scheduled shifts that week.
export function baseSalaryForWeek(entries, userName, weekStart) {
  const key = nameKey(userName)
  let total = 0
  for (const d of weekDatesISO(weekStart)) {
    for (const e of scheduleEntriesForDate(entries || [], d)) {
      if (nameKey(e.employee_name) === key) total += entryPay(e)
    }
  }
  return total
}
