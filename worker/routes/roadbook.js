// Пътен лист (Road Book) — admin-only reporting layer over the permanent
// usage_history table. See worker/lib/roadbook.js for the query/export logic this
// just wires up to routes + audit logging.
import { ok, fail, fileResponse } from '../lib/http.js'
import { requireAdmin, audit } from '../lib/auth.js'
import { mondayOfISO, dateOnly } from '../lib/util.js'
import { queryRoadBook, generateRoadBookExport } from '../lib/roadbook.js'

// Live view — always reflects the current usage_history, including any later
// correction (spec §17: "a correction should appear in the Road Book immediately").
// Either weekStart (Monday) or an explicit dateFrom/dateTo range; defaults to the
// current week if neither is given, so a bare call is never an unscoped full scan.
export async function getRoadBook(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  let dateFrom, dateToExclusive

  if (params?.weekStart) {
    const weekStart = mondayOfISO(params.weekStart)
    const end = new Date(weekStart + 'T00:00:00Z')
    end.setUTCDate(end.getUTCDate() + 7)
    dateFrom = weekStart
    dateToExclusive = end.toISOString().slice(0, 10)
  } else if (params?.dateFrom && params?.dateTo) {
    dateFrom = params.dateFrom
    const end = new Date(params.dateTo + 'T00:00:00Z')
    end.setUTCDate(end.getUTCDate() + 1) // dateTo is inclusive from the caller's side
    dateToExclusive = end.toISOString().slice(0, 10)
  } else {
    const weekStart = mondayOfISO(dateOnly(new Date()))
    const end = new Date(weekStart + 'T00:00:00Z')
    end.setUTCDate(end.getUTCDate() + 7)
    dateFrom = weekStart
    dateToExclusive = end.toISOString().slice(0, 10)
  }

  const result = await queryRoadBook(db, {
    dateFrom,
    dateToExclusive,
    carId: params?.carId || undefined,
    limit: params?.limit,
    offset: params?.offset,
  })
  return ok(result)
}

// "Изтегли Excel" (manual, any week) and "Генерирай отново" (an already-archived
// week) are the same operation — an explicit request always regenerates fresh from
// current data, and (re)writes that week's frozen snapshot in roadbook_exports.
export async function exportRoadBookExcel(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin
  if (!params?.weekStart) return fail('validation')

  const result = await generateRoadBookExport(ctx.env.DB, params.weekStart, ctx.user)
  if (result.status === 'error') return fail('roadbook_export_failed', { message: result.error })

  await audit(
    ctx.env.DB, ctx.user, 'roadbook_export_generated', 'roadbook_export', result.weekStart,
    `${result.weekStart} – ${result.weekEnd}`
  )
  return fileResponse(result.bytes, result.fileName)
}

// Metadata only (no blob) — the "Архив на експорти" list.
export async function getRoadBookExportArchive(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT export_id, week_start, week_end, status, generated_at, generated_by_id, generated_by_name, error_message, file_name
       FROM roadbook_exports ORDER BY week_start DESC`
    )
    .all()
  return ok({ exports: results })
}

// Serves the STORED snapshot as-is — never regenerates (spec §9: "Do not regenerate
// old exports every time unless requested").
export async function downloadRoadBookExport(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin
  if (!params?.weekStart) return fail('validation')

  const weekStart = mondayOfISO(params.weekStart)
  const row = await ctx.env.DB
    .prepare('SELECT file_name, file_blob, status FROM roadbook_exports WHERE week_start = ?')
    .bind(weekStart)
    .first()
  if (!row || row.status !== 'ready' || !row.file_blob) return fail('not_found')

  await audit(ctx.env.DB, ctx.user, 'roadbook_export_downloaded', 'roadbook_export', weekStart, row.file_name)
  return fileResponse(new Uint8Array(row.file_blob), row.file_name)
}
