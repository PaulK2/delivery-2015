// Availability — direct port of the matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, canSubmitAvailability, getSetting, setSetting, audit } from '../lib/auth.js'
import { genId, nowStamp, normalizeIsoDate, nextMondayISO } from '../lib/util.js'

export async function getAvailability(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const { results } =
    params && params.weekStart
      ? await db.prepare('SELECT * FROM availability WHERE week_start = ?').bind(String(params.weekStart).trim()).all()
      : await db.prepare('SELECT * FROM availability').all()

  const availability = results.map((row) => ({
    ...row,
    week_start: normalizeIsoDate(row.week_start),
    date: normalizeIsoDate(row.date),
  }))
  return ok({ availability })
}

// Replaces this employee's rows for the given week in one atomic batch (delete + the
// new set of shifts) — D1 batches run as a single transaction, so this can't leave a
// half-replaced week the way a separate delete-then-append could.
export async function saveAvailability(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB

  // Pure admins review the team's requests but never submit their own shifts; admins
  // who also work shifts (worker-admins) may submit. Enforced here, not just in the UI.
  if (!canSubmitAvailability(ctx.user)) return fail('admin_no_availability')
  if ((await getSetting(db, 'availability_open')) !== 'true') return fail('availability_closed')

  const weekStart = params.weekStart
  const entries = params.entries || []
  if (!weekStart || !Array.isArray(entries)) return fail('validation')

  const allowed = ['none', 'full', 'evening']
  for (const e of entries) {
    if (!e.date || !allowed.includes(e.shiftType)) return fail('validation')
  }

  const updatedAt = nowStamp()
  const stmts = [
    db.prepare('DELETE FROM availability WHERE employee_id = ? AND week_start = ?').bind(ctx.user.employee_id, weekStart),
  ]
  for (const entry of entries) {
    if (entry.shiftType === 'none') continue
    stmts.push(
      db
        .prepare('INSERT INTO availability (availability_id, employee_id, employee_name, week_start, date, shift_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(genId('AVL'), ctx.user.employee_id, ctx.user.name, weekStart, entry.date, entry.shiftType, updatedAt)
    )
  }
  await db.batch(stmts)

  await audit(db, ctx.user, 'availability_saved', 'availability', weekStart, '')
  return ok({ updated_at: updatedAt })
}

export async function setAvailabilityOpen(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const open = params.open === true
  await setSetting(db, 'availability_open', open ? 'true' : 'false')
  await audit(db, ctx.user, open ? 'availability_opened' : 'availability_closed', 'settings', 'availability_open', '')
  return ok({ open })
}

// week_start defaults to next week's Monday if not explicitly set by an admin.
export async function getAvailabilityStatus(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const weekStart = (await getSetting(db, 'availability_week_start')) || nextMondayISO()
  return ok({ open: (await getSetting(db, 'availability_open')) === 'true', week_start: weekStart })
}

export async function setAvailabilityWeek(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const weekStart = String(params.weekStart || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail('validation')

  const db = ctx.env.DB
  await setSetting(db, 'availability_week_start', weekStart)
  await audit(db, ctx.user, 'availability_week_set', 'settings', 'availability_week_start', weekStart)
  return ok({ week_start: weekStart })
}
