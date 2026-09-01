// Payroll (weekly pay = base + orders + fuel; payment/received tracking) — direct
// port of the matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, audit } from '../lib/auth.js'
import { genId, nowStamp, dateOnly, normalizeIsoDate, mondayOfISO, toNumberOrNull, strictBool } from '../lib/util.js'

function serializePayrollRow(row) {
  return {
    payroll_id: row.payroll_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    week_start: normalizeIsoDate(row.week_start),
    base_salary: toNumberOrNull(row.base_salary),
    orders_count: toNumberOrNull(row.orders_count),
    orders_salary: toNumberOrNull(row.orders_salary),
    fuel_salary: toNumberOrNull(row.fuel_salary),
    final_amount: toNumberOrNull(row.final_amount),
    paid: strictBool(row.paid),
    paid_at: row.paid_at || '',
    paid_by_id: row.paid_by_id || '',
    paid_by_name: row.paid_by_name || '',
    received_confirmed: strictBool(row.received_confirmed),
    received_confirmed_at: row.received_confirmed_at || '',
    updated_at: row.updated_at,
  }
}

// Sum Orders and FuelExpenses per employee for a week (base salary comes from the
// schedule and is supplied by the client, which parses that grid).
async function aggregateWeek(db, weekStart) {
  const orders = {}
  const { results: orderRows } = await db.prepare('SELECT * FROM orders WHERE week_start = ?').bind(weekStart).all()
  for (const r of orderRows) {
    const id = String(r.employee_id)
    if (!orders[id]) orders[id] = { employee_id: id, employee_name: r.employee_name || '', orders_count: 0, orders_salary: 0 }
    orders[id].orders_count += toNumberOrNull(r.order_count) || 0
    orders[id].orders_salary += toNumberOrNull(r.order_salary) || 0
  }

  const fuel = {}
  const { results: fuelRows } = await db.prepare('SELECT * FROM fuel_expenses WHERE week_start = ?').bind(weekStart).all()
  for (const r of fuelRows) {
    const id = String(r.employee_id)
    if (!fuel[id]) fuel[id] = { employee_id: id, employee_name: r.employee_name || '', fuel_salary: 0 }
    fuel[id].fuel_salary += toNumberOrNull(r.amount) || 0
  }

  return { orders: Object.values(orders), fuel: Object.values(fuel) }
}

// Admin: payroll payment state for a week + server-side order/fuel aggregates. The
// client adds base salary (from the schedule) and merges by employee_id.
export async function getPayrollForWeek(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()))
  const { results } = await db.prepare('SELECT * FROM payroll WHERE week_start = ?').bind(weekStart).all()
  const agg = await aggregateWeek(db, weekStart)

  return ok({ week_start: weekStart, payroll: results.map(serializePayrollRow), orders: agg.orders, fuel: agg.fuel })
}

// A worker's own payroll record for a week (so they can see paid/received state).
export async function getMyPayroll(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()))
  const row = await ctx.env.DB
    .prepare('SELECT * FROM payroll WHERE week_start = ? AND employee_id = ?')
    .bind(weekStart, ctx.user.employee_id)
    .first()

  return ok({ week_start: weekStart, payroll: row ? serializePayrollRow(row) : null })
}

// Admin: mark (or unmark) a worker's weekly salary as paid, snapshotting the amounts so
// the historical record is preserved independently of later schedule/order/fuel changes.
// Fields the caller didn't provide keep their previous value (mirrors the sheet
// version's "only write columns that were actually passed" behavior).
export async function setPayrollPaid(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const employeeId = String(params.employeeId || '')
  const weekStart = mondayOfISO(params.weekStart || '')
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail('validation')

  const db = ctx.env.DB
  const paid = params.paid !== false
  const now = nowStamp()

  const existing = await db.prepare('SELECT * FROM payroll WHERE employee_id = ? AND week_start = ?').bind(employeeId, weekStart).first()

  const baseSalary = params.baseSalary != null ? toNumberOrNull(params.baseSalary) : existing?.base_salary ?? null
  const ordersCount = params.ordersCount != null ? toNumberOrNull(params.ordersCount) : existing?.orders_count ?? null
  const ordersSalary = params.ordersSalary != null ? toNumberOrNull(params.ordersSalary) : existing?.orders_salary ?? null
  const fuelSalary = params.fuelSalary != null ? toNumberOrNull(params.fuelSalary) : existing?.fuel_salary ?? null
  const finalAmount = params.finalAmount != null ? toNumberOrNull(params.finalAmount) : existing?.final_amount ?? null

  const receivedConfirmed = paid ? strictBool(existing?.received_confirmed) : false
  const receivedConfirmedAt = paid ? existing?.received_confirmed_at || '' : ''

  const id = existing?.payroll_id || genId('PAY')
  await db
    .prepare(
      `INSERT INTO payroll (payroll_id, employee_id, employee_name, week_start, base_salary, orders_count,
       orders_salary, fuel_salary, final_amount, paid, paid_at, paid_by_id, paid_by_name,
       received_confirmed, received_confirmed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, week_start) DO UPDATE SET
         base_salary = excluded.base_salary, orders_count = excluded.orders_count,
         orders_salary = excluded.orders_salary, fuel_salary = excluded.fuel_salary,
         final_amount = excluded.final_amount, paid = excluded.paid, paid_at = excluded.paid_at,
         paid_by_id = excluded.paid_by_id, paid_by_name = excluded.paid_by_name,
         received_confirmed = excluded.received_confirmed, received_confirmed_at = excluded.received_confirmed_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      id, employeeId, String(params.employeeName || existing?.employee_name || ''), weekStart,
      baseSalary, ordersCount, ordersSalary, fuelSalary, finalAmount,
      paid ? 1 : 0, paid ? now : '', paid ? ctx.user.employee_id : '', paid ? ctx.user.name : '',
      receivedConfirmed ? 1 : 0, receivedConfirmedAt, now
    )
    .run()

  await audit(db, ctx.user, paid ? 'payroll_marked_paid' : 'payroll_unmarked_paid', 'payroll', employeeId, weekStart)
  return ok({ employee_id: employeeId, week_start: weekStart, paid })
}

// Worker confirms they received their pay for a week (requires the admin to have marked
// it paid first). A second, independent confirmation so discrepancies show.
export async function confirmPayrollReceived(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const weekStart = mondayOfISO(params.weekStart || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail('validation')

  const db = ctx.env.DB
  const row = await db.prepare('SELECT * FROM payroll WHERE employee_id = ? AND week_start = ?').bind(ctx.user.employee_id, weekStart).first()
  if (!row) return fail('not_found')
  if (!strictBool(row.paid)) return fail('not_paid_yet')

  const now = nowStamp()
  await db
    .prepare('UPDATE payroll SET received_confirmed = 1, received_confirmed_at = ?, updated_at = ? WHERE payroll_id = ?')
    .bind(now, now, row.payroll_id)
    .run()

  await audit(db, ctx.user, 'payroll_received_confirmed', 'payroll', ctx.user.employee_id, weekStart)
  return ok({ week_start: weekStart, received_confirmed: true })
}
