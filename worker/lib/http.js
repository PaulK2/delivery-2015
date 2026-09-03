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

// A handler returns this instead of ok()/fail() when the action's whole point is to
// hand back a file (the Пътен лист .xlsx export) — handleApi() in index.js recognizes
// the shape and produces a raw binary Response instead of the usual JSON envelope.
export function fileResponse(bytes, filename, contentType) {
  return {
    __fileResponse: true,
    bytes,
    filename,
    contentType:
      contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}
