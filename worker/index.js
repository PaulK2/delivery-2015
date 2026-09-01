// Worker entry point. Everything under /api is the operational backend (D1-backed,
// replacing Apps Script); everything else falls through to the static SPA assets.
import { ok, fail, jsonResponse } from './lib/http.js'
import { resolveSession } from './lib/auth.js'
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

  return jsonResponse(result)
}
