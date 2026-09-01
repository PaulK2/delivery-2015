// Maintenance — direct port of the matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, audit } from '../lib/auth.js'
import { genId, nowStamp } from '../lib/util.js'

const CATEGORIES = ['engine', 'tires', 'brakes', 'lights', 'body', 'interior', 'electronics', 'fluids', 'documents', 'other']
const SEVERITIES = ['low', 'medium', 'critical']

export async function getMaintenance(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const clauses = []
  const args = []
  if (params && params.carId) {
    clauses.push('car_id = ?')
    args.push(params.carId)
  }
  if (params && params.status) {
    clauses.push('status = ?')
    args.push(params.status)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const { results } = await db
    .prepare(`SELECT * FROM maintenance ${where} ORDER BY reported_at DESC`)
    .bind(...args)
    .all()

  return ok({ maintenance: results })
}

export async function reportIssue(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const issue = params.issue || {}
  if (!issue.carId || !issue.title) return fail('validation')

  const car = await db.prepare('SELECT * FROM cars WHERE car_id = ?').bind(issue.carId).first()
  if (!car) return fail('car_not_found')

  const category = CATEGORIES.includes(issue.category) ? issue.category : 'other'
  const severity = SEVERITIES.includes(issue.severity) ? issue.severity : 'low'
  const id = genId('MNT')

  await db
    .prepare(
      `INSERT INTO maintenance (maintenance_id, car_id, registration, reported_by_id, reported_by_name,
       reported_at, title, description, category, severity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
    )
    .bind(id, car.car_id, car.registration, ctx.user.employee_id, ctx.user.name, nowStamp(), issue.title, issue.description || '', category, severity)
    .run()

  // A critical issue automatically blocks the vehicle, unless it's currently being
  // driven — in which case the warning stays visible and an admin decides how to handle it.
  if (severity === 'critical' && car.status === 'available') {
    await db.prepare("UPDATE cars SET status = 'maintenance' WHERE car_id = ?").bind(car.car_id).run()
  }

  await audit(db, ctx.user, 'maintenance_reported', 'maintenance', id, car.registration)
  return ok({ maintenance_id: id })
}

export async function resolveIssue(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const maintenanceId = params.maintenanceId
  if (!maintenanceId) return fail('validation')

  const issue = await db.prepare('SELECT * FROM maintenance WHERE maintenance_id = ?').bind(maintenanceId).first()
  if (!issue) return fail('maintenance_not_found')
  if (String(issue.status) === 'resolved') return fail('already_resolved')

  await db
    .prepare(
      `UPDATE maintenance SET status = 'resolved', resolved_at = ?, resolved_by_id = ?, resolved_by_name = ?,
       repair_description = ?, service = ?, cost = ?, notes = ? WHERE maintenance_id = ?`
    )
    .bind(
      nowStamp(), ctx.user.employee_id, ctx.user.name,
      params.repairDescription || '', params.service || '', params.cost || '', params.notes || '',
      maintenanceId
    )
    .run()

  await audit(db, ctx.user, 'maintenance_resolved', 'maintenance', maintenanceId, '')
  return ok({})
}
