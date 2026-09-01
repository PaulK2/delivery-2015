// Orders (worker order counts + €0.50/order salary) — direct port of the matching
// Backend.gs section. One row per employee+date; saved again via SQLite upsert
// (unique(employee_id, date)) instead of the sheet's scan-then-append-or-update.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireWorker, audit } from '../lib/auth.js'
import { genId, nowStamp, dateOnly, normalizeIsoDate, mondayOfISO, toNumberOrNull } from '../lib/util.js'

const ORDER_RATE_EUR = 0.5

function serializeOrder(row) {
  return {
    order_record_id: row.order_record_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    restaurant: row.restaurant || '',
    shift_type: row.shift_type || '',
    order_count: toNumberOrNull(row.order_count) || 0,
    order_salary: toNumberOrNull(row.order_salary) || 0,
    updated_at: row.updated_at,
  }
}

export async function saveOrderCount(params, ctx) {
  const notWorker = requireWorker(ctx)
  if (notWorker) return notWorker

  const date = normalizeIsoDate(params.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('validation')
  if (date > dateOnly(new Date())) return fail('future_date')

  let count = toNumberOrNull(params.orderCount)
  if (count == null || count < 0) return fail('validation')
  count = Math.round(count)

  const restaurant = String(params.restaurant || '').trim()
  const shiftType = String(params.shiftType || '').trim()
  const weekStart = mondayOfISO(date)
  const salary = count * ORDER_RATE_EUR
  const updatedAt = nowStamp()
  const id = genId('ORD')

  const db = ctx.env.DB
  const row = await db
    .prepare(
      `INSERT INTO orders (order_record_id, employee_id, employee_name, date, week_start, restaurant, shift_type, order_count, order_salary, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET
         week_start = excluded.week_start, restaurant = excluded.restaurant, shift_type = excluded.shift_type,
         order_count = excluded.order_count, order_salary = excluded.order_salary, updated_at = excluded.updated_at
       RETURNING order_record_id`
    )
    .bind(id, ctx.user.employee_id, ctx.user.name, date, weekStart, restaurant, shiftType, count, salary, updatedAt)
    .first()

  await audit(db, ctx.user, 'order_count_saved', 'orders', row.order_record_id, date + ' · ' + count + ' поръчки')
  return ok({ order_record_id: row.order_record_id, order_count: count, order_salary: salary })
}

// Orders for a week. Non-admins only ever see their own; admins may pass employeeId to
// scope, or omit it for the whole team.
export async function getOrdersForWeek(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()))
  const isAdmin = String(ctx.user.role) === 'admin'
  const scopeEmp = isAdmin ? (params.employeeId ? String(params.employeeId) : '') : String(ctx.user.employee_id)

  const db = ctx.env.DB
  const { results } = scopeEmp
    ? await db.prepare('SELECT * FROM orders WHERE week_start = ? AND employee_id = ?').bind(weekStart, scopeEmp).all()
    : await db.prepare('SELECT * FROM orders WHERE week_start = ?').bind(weekStart).all()

  return ok({ orders: results.map(serializeOrder), week_start: weekStart })
}
