// Пътен лист (Road Book) — a reporting layer over the PERMANENT usage_history table
// (Vehicle take/release already writes it — see routes/cars.js). This module never
// writes to usage_history; it only reads it and writes to roadbook_exports (frozen
// weekly Excel snapshots).
import { buildXlsx } from './xlsx.js'
import { genId, nowStamp, mondayOfISO, weekEndFromMonday, formatDateBG, formatDateTimeBG } from './util.js'

// Queries usage_history for [dateFrom, dateToExclusive) (yyyy-MM-dd), optionally
// scoped to one car, and computes an "effective end" for any row missing end_at:
//   - if a LATER usage row exists for the same car (chronologically, in the WHOLE
//     history, not just the queried window), its start_at is used as a stand-in end —
//     this only ever happens for old/incomplete migrated data (spec §3);
//   - never touches/rewrites the stored row itself.
// The LEAD() window function runs over the full table (subquery, before the date
// filter) specifically so a row near the edge of the window still finds its true next
// session even if that next session started just outside the requested range.
const DEFAULT_PAGE_SIZE = 500
const MAX_PAGE_SIZE = 2000

export async function queryRoadBook(db, { dateFrom, dateToExclusive, carId, limit, offset }) {
  const clauses = ['start_at >= ?', 'start_at < ?']
  const args = [dateFrom, dateToExclusive]
  if (carId) {
    clauses.push('car_id = ?')
    args.push(carId)
  }

  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const pageOffset = Math.max(Number(offset) || 0, 0)

  const sql = `
    SELECT * FROM (
      SELECT
        usage_id, car_id, registration, employee_id, employee_name,
        start_at, end_at, parked_location,
        LEAD(start_at) OVER (PARTITION BY car_id ORDER BY start_at) AS next_start
      FROM usage_history
    )
    WHERE ${clauses.join(' AND ')}
    ORDER BY registration, start_at
    LIMIT ? OFFSET ?
  `
  // Fetch one extra row to know whether there's a next page, without a separate COUNT query.
  const { results } = await db.prepare(sql).bind(...args, pageSize + 1, pageOffset).all()
  const hasMore = results.length > pageSize
  const page = hasMore ? results.slice(0, pageSize) : results

  const entries = page.map((row) => {
    const hasEnd = !!row.end_at
    const isActive = !hasEnd && !row.next_start
    return {
      usage_id: row.usage_id,
      car_id: row.car_id,
      registration: row.registration,
      employee_id: row.employee_id,
      employee_name: row.employee_name || '',
      start_at: row.start_at,
      end_at: row.end_at || '',
      effective_end_at: hasEnd ? row.end_at : row.next_start || '',
      end_inferred: !hasEnd && !!row.next_start,
      is_active: isActive,
      parked_location: row.parked_location || '',
    }
  })

  return { entries, hasMore, limit: pageSize, offset: pageOffset }
}

const EXPORT_HEADER = ['Автомобил', 'Шофьор', 'Дата/час вземане', 'Дата/час освобождаване', 'Място на оставяне']

function safeFileNamePart(iso) {
  return iso // yyyy-MM-dd is already filename-safe
}

// Builds the .xlsx bytes for one week (Monday-anchored). Pure — does not touch the
// database. Used for both the "Изтегли Excel" direct download and the frozen
// roadbook_exports snapshot (both call this, then the caller decides what to do with
// the bytes).
export async function buildRoadBookWorkbook(db, weekStartIso) {
  const weekEndIso = weekEndFromMonday(weekStartIso)
  const toExclusive = new Date(weekEndIso + 'T00:00:00Z')
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)

  // A week's worth of usage rows for a fleet this size is always far under the page
  // cap — request it in one shot (no export pagination; the report is meant to be complete).
  const { entries: rows } = await queryRoadBook(db, {
    dateFrom: weekStartIso,
    dateToExclusive: toExclusive.toISOString().slice(0, 10),
    limit: MAX_PAGE_SIZE,
  })

  const sheetRows = [
    ['Пътен лист'],
    [`Период: ${formatDateBG(weekStartIso)} – ${formatDateBG(weekEndIso)}`],
    [`Генериран: ${formatDateTimeBG(nowStamp())}`],
    [],
    EXPORT_HEADER,
    ...rows.map((r) => [
      r.registration,
      r.employee_name,
      formatDateTimeBG(r.start_at),
      r.is_active ? '' : formatDateTimeBG(r.effective_end_at),
      r.parked_location,
    ]),
  ]

  const bytes = buildXlsx('Пътен лист', sheetRows, [14, 22, 20, 24, 22])
  const fileName = `Paten-list-${safeFileNamePart(weekStartIso)}_${safeFileNamePart(weekEndIso)}.xlsx`
  return { bytes, fileName, weekEndIso, rowCount: rows.length }
}

// Generates (or regenerates) the frozen snapshot for one week and upserts it into
// roadbook_exports (UNIQUE week_start — a regeneration replaces the row, it never
// accumulates duplicates). `actor` is the admin ctx.user triggering this, or null for
// the automatic Monday cron run. Never throws — a failure is recorded as a row with
// status='error' instead, so a cron failure doesn't crash the whole scheduled run and
// an admin can still see + retry it from the archive.
export async function generateRoadBookExport(db, weekStartIsoRaw, actor) {
  const weekStartIso = mondayOfISO(weekStartIsoRaw)
  const now = nowStamp()

  try {
    const { bytes, fileName, weekEndIso } = await buildRoadBookWorkbook(db, weekStartIso)
    const id = genId('RBX')
    await db
      .prepare(
        `INSERT INTO roadbook_exports
           (export_id, week_start, week_end, status, generated_at, generated_by_id, generated_by_name, error_message, file_name, file_blob)
         VALUES (?, ?, ?, 'ready', ?, ?, ?, '', ?, ?)
         ON CONFLICT(week_start) DO UPDATE SET
           status = 'ready', generated_at = excluded.generated_at, generated_by_id = excluded.generated_by_id,
           generated_by_name = excluded.generated_by_name, error_message = '', file_name = excluded.file_name,
           file_blob = excluded.file_blob`
      )
      .bind(id, weekStartIso, weekEndIso, now, actor?.employee_id || '', actor?.name || '', fileName, bytes)
      .run()

    return { status: 'ready', weekStart: weekStartIso, weekEnd: weekEndIso, fileName, bytes }
  } catch (e) {
    console.error('generateRoadBookExport failed for', weekStartIso, e)
    const weekEndIso = weekEndFromMonday(weekStartIso)
    const message = String(e?.message || e).slice(0, 500)
    await db
      .prepare(
        `INSERT INTO roadbook_exports
           (export_id, week_start, week_end, status, generated_at, generated_by_id, generated_by_name, error_message, file_name, file_blob)
         VALUES (?, ?, ?, 'error', ?, ?, ?, ?, '', NULL)
         ON CONFLICT(week_start) DO UPDATE SET
           status = 'error', generated_at = excluded.generated_at, generated_by_id = excluded.generated_by_id,
           generated_by_name = excluded.generated_by_name, error_message = excluded.error_message`
      )
      .bind(genId('RBX'), weekStartIso, weekEndIso, now, actor?.employee_id || '', actor?.name || '', message)
      .run()
      .catch((e2) => console.error('failed to even record the roadbook export error:', e2))

    return { status: 'error', weekStart: weekStartIso, weekEnd: weekEndIso, error: message }
  }
}
