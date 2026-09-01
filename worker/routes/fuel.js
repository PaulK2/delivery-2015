// Fuel expenses (per-usage fuel-money balance + weekly totals) — direct port of the
// matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, audit } from '../lib/auth.js'
import { genId, nowStamp, dateOnly, normalizeIsoDate, mondayOfISO, toNumberOrNull } from '../lib/util.js'

function serializeFuel(row) {
  return {
    fuel_entry_id: row.fuel_entry_id,
    car_id: row.car_id,
    registration: row.registration || '',
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    usage_id: row.usage_id || '',
    amount: toNumberOrNull(row.amount) || 0,
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    created_at: row.created_at,
    notes: row.notes || '',
  }
}

// The current driver (or an admin) records a fuel expense for the car they're driving.
// The amount is subtracted from the fuel money that was in the vehicle when it was taken.
export async function addFuelExpense(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const car = await db.prepare('SELECT * FROM cars WHERE car_id = ?').bind(params.carId).first()
  if (!car) return fail('car_not_found')
  if (String(car.status) !== 'in_use') return fail('car_not_in_use')

  const isDriver = String(car.current_driver_id) === String(ctx.user.employee_id)
  const isAdmin = String(ctx.user.role) === 'admin'
  if (!isDriver && !isAdmin) return fail('forbidden')

  const amount = toNumberOrNull(params.amount)
  if (amount == null || amount <= 0) return fail('validation')

  const now = nowStamp()
  const date = dateOnly(new Date())
  const weekStart = mondayOfISO(date)
  const id = genId('FUEL')
  const notes = String(params.notes || '').trim()

  const newSpent = (toNumberOrNull(car.fuel_spent_total) || 0) + amount
  const start = toNumberOrNull(car.fuel_cash_start)
  const remaining = start == null ? null : start - newSpent

  await db.batch([
    db
      .prepare(
        `INSERT INTO fuel_expenses (fuel_entry_id, car_id, registration, employee_id, employee_name, usage_id, amount, date, week_start, created_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, car.car_id, car.registration, ctx.user.employee_id, ctx.user.name, car.current_usage_id || '', amount, date, weekStart, now, notes),
    db.prepare('UPDATE cars SET fuel_spent_total = ? WHERE car_id = ?').bind(newSpent, car.car_id),
  ])

  await audit(db, ctx.user, 'fuel_expense_added', 'car', car.car_id, car.registration + ' · ' + amount + ' €')
  return ok({ fuel_entry_id: id, amount, fuel_spent_total: newSpent, fuel_cash_remaining: remaining })
}

// Fuel expenses for a week. Non-admins see only their own; admins see all, optionally
// filtered to one car (for the per-vehicle weekly fuel view).
export async function getFuelExpensesForWeek(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()))
  const isAdmin = String(ctx.user.role) === 'admin'
  const carId = params.carId ? String(params.carId) : ''
  const scopeEmp = isAdmin ? '' : String(ctx.user.employee_id)

  const clauses = ['week_start = ?']
  const args = [weekStart]
  if (carId) {
    clauses.push('car_id = ?')
    args.push(carId)
  }
  if (scopeEmp) {
    clauses.push('employee_id = ?')
    args.push(scopeEmp)
  }

  const { results } = await ctx.env.DB
    .prepare(`SELECT * FROM fuel_expenses WHERE ${clauses.join(' AND ')}`)
    .bind(...args)
    .all()
  return ok({ fuel: results.map(serializeFuel), week_start: weekStart })
}

// Fuel expenses for one usage session (the active-vehicle page lists what's been spent).
export async function getFuelExpensesForUsage(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const usageId = String(params.usageId || '')
  if (!usageId) return fail('validation')

  const { results } = await ctx.env.DB.prepare('SELECT * FROM fuel_expenses WHERE usage_id = ?').bind(usageId).all()
  return ok({ fuel: results.map(serializeFuel) })
}
