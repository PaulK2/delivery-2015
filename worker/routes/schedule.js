// External schedule (boss's sheet) — READ ONLY, never written to. Direct port of the
// matching Backend.gs section; actual fetch/parse/cache lives in lib/schedule.js.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, getSetting, setSetting, audit } from '../lib/auth.js'
import { extractSpreadsheetId, readScheduleMatrix } from '../lib/schedule.js'

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
