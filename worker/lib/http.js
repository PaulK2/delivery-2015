// Response helpers — same envelope shape the frontend already expects from the old
// Apps Script backend: { ok: true, data } / { ok: false, error, details? }.

export function ok(data) {
  return { ok: true, data: data === undefined ? {} : data }
}

export function fail(code, extra) {
  const result = { ok: false, error: code || 'server_error' }
  if (extra) result.details = extra
  return result
}

export function jsonResponse(object) {
  return new Response(JSON.stringify(object), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
