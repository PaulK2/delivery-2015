// Worker entry point. Everything under /api is the operational backend (D1-backed,
// replacing Apps Script); everything else falls through to the static SPA assets.
// Also exports `scheduled` — the Cloudflare Cron Trigger for weekly Пътен лист export.
import { ok, fail, jsonResponse } from './lib/http.js'
import { resolveSession, audit } from './lib/auth.js'
import { mondayOfISO, dateOnly } from './lib/util.js'
import { generateRoadBookExport } from './lib/roadbook.js'
import { ROUTES } from './routes/index.js'

const BACKEND_VERSION = 'worker-d1-2026-09-01'

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return jsonResponse(ok({ service: 'fleetview-worker', status: 'ok', version: BACKEND_VERSION }))
    }

    if (url.pathname === '/api') {
      if (request.method !== 'POST') return jsonResponse(fail('not_found'))
      return handleApi(request, env)
    }

    return env.ASSETS.fetch(request)
  },

  // Cloudflare Cron Trigger (see wrangler.jsonc's `triggers.crons`) — fires Monday
  // 03:00 UTC (safely into Monday even accounting for Sofia's UTC+2/+3 offset, so
  // "today" is unambiguous) and generates the Пътен лист export for the week that
  // JUST ended (last Monday–Sunday). Never touches usage_history — read-only reporting.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWeeklyRoadBookExport(env))
  },
}

async function runWeeklyRoadBookExport(env) {
  const todayMonday = mondayOfISO(dateOnly(new Date()))
  const d = new Date(todayMonday + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  const previousMonday = d.toISOString().slice(0, 10)

  const result = await generateRoadBookExport(env.DB, previousMonday, null)
  if (result.status === 'error') {
    console.error('Weekly Road Book auto-export FAILED for', previousMonday, result.error)
  } else {
    console.log('Weekly Road Book auto-export generated for', previousMonday, '-', result.weekEnd)
  }
  await audit(
    env.DB, null,
    result.status === 'error' ? 'roadbook_export_auto_failed' : 'roadbook_export_auto_generated',
    'roadbook_export', previousMonday,
    result.status === 'error' ? result.error : `${previousMonday} – ${result.weekEnd}`
  )
}

async function handleApi(request, env) {
  let result
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action
    const params = body.params || {}
    const handler = ROUTES[action]

    if (!handler) {
      result = fail('not_found')
    } else {
      const user = await resolveSession(env.DB, body.token).catch(() => null)
      const ctx = { user, token: body.token || null, env }
      result = await handler(params, ctx)
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error))
    result = fail('server_error')
  }

  if (result && result.__fileResponse) {
    return new Response(result.bytes, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    })
  }

  return jsonResponse(result)
}
