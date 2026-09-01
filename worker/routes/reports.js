// Daily reports (detailed deliveries by payment/channel type) — direct port of the
// matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, requireWorker, audit } from '../lib/auth.js'
import { genId, nowStamp, dateOnly, normalizeIsoDate, mondayOfISO, toNumberOrNull } from '../lib/util.js'

function serializeReportRow(row) {
  return {
    report_id: row.report_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    restaurant: row.restaurant || '',
    delivery_type: row.delivery_type || '',
    amount: toNumberOrNull(row.amount) || 0,
    updated_at: row.updated_at,
  }
}

// Worker saves their daily report as INDIVIDUAL deliveries: one row per delivery, each
// with its money value. The save fully replaces the worker's rows for this
// date+restaurant (atomic delete + re-insert via batch), so adding/editing/removing a
// delivery on the client is reflected exactly.
export async function saveDailyReport(params, ctx) {
  const notWorker = requireWorker(ctx)
  if (notWorker) return notWorker

  const date = normalizeIsoDate(params.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('validation')
  if (date > dateOnly(new Date())) return fail('future_date')

  const restaurant = String(params.restaurant || '').trim()
  if (!restaurant) return fail('validation')

  const deliveries = Array.isArray(params.deliveries) ? params.deliveries : []
  const weekStart = mondayOfISO(date)
  const updatedAt = nowStamp()
  const db = ctx.env.DB

  const stmts = [
    db
      .prepare('DELETE FROM daily_reports WHERE employee_id = ? AND date = ? AND restaurant = ?')
      .bind(ctx.user.employee_id, date, restaurant),
  ]

  let saved = 0
  for (const d of deliveries) {
    const type = String(d.delivery_type || '').trim()
    if (!type) continue
    let amount = toNumberOrNull(d.amount)
    if (amount == null || amount < 0) amount = 0
    amount = Math.round(amount * 100) / 100 // keep cents
    stmts.push(
      db
        .prepare('INSERT INTO daily_reports (report_id, employee_id, employee_name, date, week_start, restaurant, delivery_type, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(genId('RPT'), ctx.user.employee_id, ctx.user.name, date, weekStart, restaurant, type, amount, updatedAt)
    )
    saved++
  }
  await db.batch(stmts)

  await audit(db, ctx.user, 'daily_report_saved', 'report', ctx.user.employee_id + ':' + date, restaurant + ' · ' + saved + ' доставки')
  return ok({ date, restaurant, count: saved })
}

// A worker's report for a day (own only for non-admins; admins may pass employeeId).
export async function getDailyReport(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const date = normalizeIsoDate(params.date)
  const isAdmin = String(ctx.user.role) === 'admin'
  const scopeEmp = isAdmin ? (params.employeeId ? String(params.employeeId) : '') : String(ctx.user.employee_id)
  const restaurant = params.restaurant ? String(params.restaurant) : ''

  const clauses = ['date = ?']
  const args = [date]
  if (scopeEmp) {
    clauses.push('employee_id = ?')
    args.push(scopeEmp)
  }
  if (restaurant) {
    clauses.push('restaurant = ?')
    args.push(restaurant)
  }

  const { results } = await ctx.env.DB
    .prepare(`SELECT * FROM daily_reports WHERE ${clauses.join(' AND ')}`)
    .bind(...args)
    .all()
  return ok({ report: results.map(serializeReportRow), date })
}

// Admin: every worker's report rows for one date (grouped restaurant→worker on the client).
export async function getReportsForDate(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const date = normalizeIsoDate(params.date)
  const { results } = await ctx.env.DB.prepare('SELECT * FROM daily_reports WHERE date = ?').bind(date).all()
  return ok({ reports: results.map(serializeReportRow), date })
}
