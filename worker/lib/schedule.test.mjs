// Proves the boss's schedule sheet is only ever READ, never written to.
//
// Two complementary checks:
//  1. Structural: no file under worker/ references a Google API capable of writing
//     (Sheets API v4, any OAuth/service-account credential) — so a write isn't just
//     "not currently triggered", it's not something the code could even do. The only
//     Google touchpoint anywhere in worker/ is schedule.js's single fetch() call.
//  2. Behavioral: actually calling the function that talks to Google
//     (fetchScheduleMatrixForUrl) makes exactly one network request, and it's a plain
//     GET (no method override, no body) against the public read-only CSV export
//     endpoint — never a Sheets API "values" write path.
//
// Run with: node --test worker/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchScheduleMatrixForUrl } from './schedule.js'

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function listJsFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listJsFiles(full))
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      out.push(full)
    }
  }
  return out
}

test('no Google write-capable API (Sheets API v4, OAuth/service-account credentials) is referenced anywhere in worker/', () => {
  // The authenticated Sheets API — the only way an app could actually WRITE to a
  // sheet — split so this line doesn't trip its own check.
  const sheetsWriteApi = 'sheets.' + 'googleapis.com'
  const forbidden = [sheetsWriteApi, 'service_account', 'private_key', 'client_email', 'oauth2']

  for (const file of listJsFiles(WORKER_DIR)) {
    if (file.endsWith('.test.mjs')) continue // this file's own source (comments, assertions)
    const text = readFileSync(file, 'utf8').toLowerCase()
    for (const term of forbidden) {
      assert.ok(!text.includes(term), `${file} references "${term}" — schedule sheet must stay read-only`)
    }
  }
})

test('the schedule sheet is touched from exactly one file (schedule.js) anywhere in worker/', () => {
  const touching = listJsFiles(WORKER_DIR)
    .filter((f) => !f.endsWith('schedule.test.mjs'))
    .filter((f) => readFileSync(f, 'utf8').toLowerCase().includes('docs.google.com'))
  assert.deepEqual(
    touching.map((f) => f.replace(WORKER_DIR, '').replace(/\\/g, '/')),
    ['/lib/schedule.js']
  )
})

test('fetchScheduleMatrixForUrl makes exactly one plain GET request, no body, to the read-only CSV export endpoint', async () => {
  const calls = []
  const realFetch = globalThis.fetch
  const realCaches = globalThis.caches
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } }
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: (init && init.method) || 'GET',
      hasBody: !!(init && init.body),
    })
    return new Response('ДАТА,ПИРИН\n24,ИВАН\n', {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' }, // matches Google's real header (verified by hand)
    })
  }

  try {
    const result = await fetchScheduleMatrixForUrl(
      'https://docs.google.com/spreadsheets/d/FAKE_SHEET_ID/edit?gid=999#gid=999',
      true // forceRefresh — always hit the network, never a cache short-circuit
    )
    assert.equal(result.configured, true) // sanity: the mocked fetch was actually used

    assert.equal(calls.length, 1, 'expected exactly one outbound request to Google')
    const [call] = calls
    assert.equal(call.method, 'GET')
    assert.equal(call.hasBody, false)
    assert.equal(call.url, 'https://docs.google.com/spreadsheets/d/FAKE_SHEET_ID/export?format=csv&gid=999')
    // Never the authenticated write-capable API, and never a values-write path.
    assert.ok(!call.url.includes('googleapis.com'))
    assert.ok(!call.url.includes('/values/'))
  } finally {
    globalThis.fetch = realFetch
    globalThis.caches = realCaches
  }
})

test('a sheet not shared "Anyone with the link" is reported as an error, not a silent empty success', async () => {
  // A private sheet doesn't 404/403 here — Google answers 200 with a sign-in/access
  // page. Confirmed by hand: a real successful export always comes back as text/csv;
  // this is what the failure case actually looks like, not a guess.
  const realFetch = globalThis.fetch
  const realCaches = globalThis.caches
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } }
  globalThis.fetch = async () =>
    new Response('<!doctype html><html><body>Sign in to continue</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

  try {
    const result = await fetchScheduleMatrixForUrl('https://docs.google.com/spreadsheets/d/FAKE_SHEET_ID/edit?gid=1', true)
    assert.equal(result.error, 'schedule_access_denied')
    assert.notEqual(result.configured, true) // never silently "succeeds" with an empty/garbage grid
  } finally {
    globalThis.fetch = realFetch
    globalThis.caches = realCaches
  }
})
