// Boss's schedule sheet — READ ONLY, never written to. Fetched via Google's public
// CSV export (the sheet is link-viewable), replacing Apps Script's SpreadsheetApp read.
// Only `configured`, `matrix`, `sheet_name` are actually consumed by the frontend
// parser (src/services/schedule/parser.js) — this reproduces exactly those.
import { getSetting } from './auth.js'

const SCHEDULE_CACHE_TTL_SEC = 1800 // 30 min — mirrors the old Apps Script cache

export function extractSpreadsheetId(url) {
  if (!url) return null
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : null
}

export function extractSheetGid(url) {
  if (!url) return null
  const m = String(url).match(/[?&#]gid=(\d+)/)
  return m ? Number(m[1]) : null
}

// Deliberately the plain "download as CSV" export (/export?format=csv), NOT the
// gviz/tq visualization-query CSV endpoint: gviz auto-detects multi-row frozen headers
// (this sheet has 2 — location name row + СЛУЖИТЕЛИ/СМЯНА/КОЛИ sub-header row) and
// flattens them into one combined header row, silently dropping a row and shifting
// everything else up by one — confirmed by diffing it against Apps Script's own
// getDisplayValues() on the real sheet. /export is a literal, faithful export and
// matches getDisplayValues() exactly. Only gid-based tab selection is supported here
// (no name-based lookup without authenticated Sheets API access) — matches how the
// admin UI actually configures the source today (paste a URL; it has a gid).
function buildCsvUrl(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid != null ? gid : 0}`
}

// Minimal RFC4180 CSV parser (quoted fields, escaped "" quotes, commas/newlines inside
// quotes) — Google's gviz CSV export follows this. No library needed for this scale.
function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      // skip — paired \n below ends the row
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// Drop trailing all-empty rows/columns, preserving the top-left origin — same trim the
// old backend applied to keep the response small and the parser's indexing unaffected.
function trimScheduleMatrix(matrix) {
  if (!matrix || !matrix.length) return matrix || []
  const nonEmpty = (v) => String(v == null ? '' : v).trim() !== ''

  let lastRow = -1
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] || []
    for (let c = 0; c < row.length; c++) {
      if (nonEmpty(row[c])) {
        lastRow = r
        break
      }
    }
  }
  if (lastRow < 0) return []

  let lastCol = -1
  for (let r = 0; r <= lastRow; r++) {
    const row = matrix[r] || []
    for (let c = row.length - 1; c > lastCol; c--) {
      if (nonEmpty(row[c])) {
        lastCol = c
        break
      }
    }
  }
  if (lastCol < 0) return []

  const out = []
  for (let r = 0; r <= lastRow; r++) out.push((matrix[r] || []).slice(0, lastCol + 1))
  return out
}

// Fetches + parses ANY schedule sheet URL (live source or an archived one — see
// schedule_archive), using the edge Cache API to avoid re-fetching Google on every 45s
// auto-refresh from every user (mirrors the old server-side TTL cache). `forceRefresh`
// (admin "refresh" button) bypasses it.
export async function fetchScheduleMatrixForUrl(url, forceRefresh) {
  const spreadsheetId = extractSpreadsheetId(url)
  if (!spreadsheetId) return { error: 'schedule_load_failed' }

  const gid = extractSheetGid(url)
  const csvUrl = buildCsvUrl(spreadsheetId, gid)

  const cache = caches.default
  const cacheKey = new Request(csvUrl)

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached.json()
  }

  let res
  try {
    res = await fetch(csvUrl)
  } catch (e) {
    console.error(e)
    return { error: 'schedule_load_failed' }
  }
  if (!res.ok) return { error: 'schedule_load_failed' }

  const text = await res.text()
  const matrix = trimScheduleMatrix(parseCSV(text))
  const result = { configured: true, matrix, sheet_name: '' }

  try {
    const cacheResponse = new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${SCHEDULE_CACHE_TTL_SEC}` },
    })
    await cache.put(cacheKey, cacheResponse)
  } catch (e) {
    /* caching is best-effort; never fail the request over it */
  }

  return result
}

// The live/current schedule source (settings.current_schedule_sheet_url) — what the
// Home map and Schedule page actually use.
export async function readScheduleMatrix(db, forceRefresh) {
  const url = await getSetting(db, 'current_schedule_sheet_url')
  if (!url) return { configured: false, matrix: [], sheet_name: '' }
  return fetchScheduleMatrixForUrl(url, forceRefresh)
}
