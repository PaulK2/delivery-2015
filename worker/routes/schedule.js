// External schedule (boss's sheet) — READ ONLY, never written to. Direct port of the
// matching Backend.gs section; actual fetch/parse/cache lives in lib/schedule.js.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, getSetting, setSetting, audit } from '../lib/auth.js'
import { extractSpreadsheetId, readScheduleMatrix, fetchScheduleMatrixForUrl } from '../lib/schedule.js'
import { genId, nowStamp } from '../lib/util.js'

const MAX_ARCHIVE_LINKS = 4

export async function getScheduleSource(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  return ok({
    url: await getSetting(db, 'current_schedule_sheet_url'),
    tab_name: await getSetting(db, 'schedule_tab_name'),
  })
}

export async function setScheduleSource(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const url = String(params.url || '').trim()
  if (!extractSpreadsheetId(url)) return fail('validation')

  // Confirm the sheet is actually reachable before saving the new source.
  await setSetting(db, 'current_schedule_sheet_url', url)
  if (params.tabName !== undefined) await setSetting(db, 'schedule_tab_name', params.tabName || '')

  const probe = await readScheduleMatrix(db, true)
  if (probe.error) return fail('schedule_load_failed')

  await audit(db, ctx.user, 'schedule_source_changed', 'settings', 'current_schedule_sheet_url', url)
  return ok({ url })
}

export async function getScheduleRaw(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const result = await readScheduleMatrix(db, params && params.refresh === true)
  if (result.error) return fail(result.error)
  return ok(result)
}

/* ============================================================================
 * SCHEDULE ARCHIVE (admin) — a small rolling set of past schedule sheet links
 * (e.g. the last ~4 weeks) so an old week's grid can still be looked up after the
 * boss moves the live source to a new sheet. Separate from the live source above —
 * never affects the Home map or the Schedule page's "current" view.
 * ========================================================================== */

export async function getScheduleArchive(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const { results } = await ctx.env.DB
    .prepare('SELECT * FROM schedule_archive ORDER BY created_at DESC')
    .all()
  return ok({ archive: results })
}

export async function saveScheduleArchiveLink(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const link = params.link || {}
  const label = String(link.label || '').trim()
  const url = String(link.url || '').trim()
  if (!label || !extractSpreadsheetId(url)) return fail('validation')

  if (link.archive_id) {
    const existing = await db.prepare('SELECT archive_id FROM schedule_archive WHERE archive_id = ?').bind(link.archive_id).first()
    if (!existing) return fail('not_found')

    // Confirm the sheet is actually reachable before saving.
    const probe = await fetchScheduleMatrixForUrl(url, true)
    if (probe.error) return fail('schedule_load_failed')

    await db.prepare('UPDATE schedule_archive SET label = ?, url = ? WHERE archive_id = ?').bind(label, url, link.archive_id).run()
    await audit(db, ctx.user, 'schedule_archive_updated', 'schedule_archive', link.archive_id, label)
    return ok({ archive_id: link.archive_id })
  }

  const count = await db.prepare('SELECT COUNT(*) AS n FROM schedule_archive').first()
  if ((count?.n || 0) >= MAX_ARCHIVE_LINKS) return fail('archive_limit', { limit: MAX_ARCHIVE_LINKS })

  const probe = await fetchScheduleMatrixForUrl(url, true)
  if (probe.error) return fail('schedule_load_failed')

  const id = genId('SCA')
  await db
    .prepare('INSERT INTO schedule_archive (archive_id, label, url, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, label, url, nowStamp())
    .run()
  await audit(db, ctx.user, 'schedule_archive_created', 'schedule_archive', id, label)
  return ok({ archive_id: id })
}

export async function deleteScheduleArchiveLink(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const archiveId = params.archiveId
  if (!archiveId) return fail('validation')

  const existing = await db.prepare('SELECT label FROM schedule_archive WHERE archive_id = ?').bind(archiveId).first()
  if (!existing) return fail('not_found')

  await db.prepare('DELETE FROM schedule_archive WHERE archive_id = ?').bind(archiveId).run()
  await audit(db, ctx.user, 'schedule_archive_deleted', 'schedule_archive', archiveId, existing.label)
  return ok({ archive_id: archiveId })
}

// Fetch + parse one archived link's grid on demand (admin viewing it) — never touches
// the live source or its cache key differently than a normal fetch would.
export async function getArchivedScheduleRaw(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const archiveId = params.archiveId
  if (!archiveId) return fail('validation')

  const row = await ctx.env.DB.prepare('SELECT * FROM schedule_archive WHERE archive_id = ?').bind(archiveId).first()
  if (!row) return fail('not_found')

  const result = await fetchScheduleMatrixForUrl(row.url, params && params.refresh === true)
  if (result.error) return fail(result.error)
  return ok({ ...result, label: row.label })
}
