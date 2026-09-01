// Auth — direct port of Backend.gs's session/password logic onto D1 + Web Crypto.
import { fail } from './http.js'
import { newToken, nowStamp, nameKeyBG } from './util.js'

const SESSION_TTL_DAYS = 30
export const MIN_PASSWORD_LEN = 6

// Same real-named-admin model as Backend.gs (spec: no shared admin account).
export const AVAILABILITY_WORKER_ADMINS = ['ПАВЕЛ', 'В. ПЕТКОВ']

// The private dev changelog (dev_notes) is visible ONLY to these two named admins —
// not even other admins (ЦЕЦО, СИМО, МАГИ) can see it.
export const DEV_NOTE_ADMINS = ['ПАВЕЛ', 'В. ПЕТКОВ']

// SHA-256(salt + password) hex — byte-for-byte the same algorithm Apps Script used
// (Utilities.computeDigest(SHA_256, salt+password)), so migrated password_hash values
// (and the copied-over PIN_SALT secret) keep every existing password working.
export async function hashPassword(password, salt) {
  const bytes = new TextEncoder().encode(String(salt || '') + String(password))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function findEmployee(db, employeeId) {
  if (!employeeId) return null
  return db.prepare('SELECT * FROM employees WHERE employee_id = ?').bind(employeeId).first()
}

// Whether a user may submit their own shift availability / personal work data. Regular
// staff always can; admins only if they're a worker-admin (they also work shifts).
export function canSubmitAvailability(user) {
  if (!user) return false
  if (String(user.role) !== 'admin') return true
  return AVAILABILITY_WORKER_ADMINS.some((n) => nameKeyBG(n) === nameKeyBG(user.name))
}

// Whether a user may see/write the private dev changelog — the two named developer-
// admins only, regardless of role (matches the "ПАВЕЛ"/"В. ПЕТКОВ" identity check used
// for worker-admin capabilities, kept separate since the two lists could diverge later).
export function canViewDevNotes(user) {
  if (!user) return false
  return DEV_NOTE_ADMINS.some((n) => nameKeyBG(n) === nameKeyBG(user.name))
}

export function publicUser(employee) {
  return {
    employee_id: employee.employee_id,
    name: employee.name,
    role: employee.role || 'employee',
    can_submit_availability: canSubmitAvailability(employee),
    can_view_dev_notes: canViewDevNotes(employee),
  }
}

export async function createSession(db, employeeId) {
  const token = newToken()
  const created = new Date()
  const expires = new Date(created.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  // Stored as real UTC instants (not the Sofia-local wall-clock text nowStamp() produces
  // elsewhere) — sessions are never shown to users, only re-parsed via `new Date(...)` for
  // the expiry check below, and the Workers runtime is always UTC, so this must be
  // unambiguous regardless of timezone to compare correctly.
  await db
    .prepare('INSERT INTO sessions (token, employee_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, employeeId, created.toISOString(), expires.toISOString())
    .run()
  return token
}

export async function resolveSession(db, token) {
  if (!token) return null
  const session = await db.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first()
  if (!session) return null
  const expires = new Date(session.expires_at)
  if (isNaN(expires.getTime()) || expires < new Date()) return null
  const employee = await findEmployee(db, session.employee_id)
  if (!employee || !employee.active) return null
  return employee
}

export async function deleteSession(db, token) {
  if (!token) return
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}

// Remove every active session for an employee (used on password reset).
export async function invalidateEmployeeSessions(db, employeeId) {
  await db.prepare('DELETE FROM sessions WHERE employee_id = ?').bind(employeeId).run()
}

export function requireAuth(ctx) {
  if (!ctx.user) return fail('unauthorized')
  return null
}

export function requireAdmin(ctx) {
  if (!ctx.user) return fail('unauthorized')
  if (String(ctx.user.role) !== 'admin') return fail('forbidden')
  return null
}

// Guard for actions that record PERSONAL work data (orders, reports, fuel, payment
// confirmation) — same capability as submitting availability.
export function requireWorker(ctx) {
  if (!ctx.user) return fail('unauthorized')
  if (!canSubmitAvailability(ctx.user)) return fail('forbidden')
  return null
}

// Guard for the private dev changelog — ПАВЕЛ / В. ПЕТКОВ only, not other admins.
export function requireDevNoteAccess(ctx) {
  if (!ctx.user) return fail('unauthorized')
  if (!canViewDevNotes(ctx.user)) return fail('forbidden')
  return null
}

export async function audit(db, user, action, entityType, entityId, details) {
  try {
    await db
      .prepare(
        'INSERT INTO audit (audit_id, timestamp, employee_id, employee_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        nowStamp(),
        user ? user.employee_id : '',
        user ? user.name : '',
        action || '',
        entityType || '',
        entityId || '',
        details || ''
      )
      .run()
  } catch (e) {
    console.error('Audit failure:', e)
  }
}

export async function getSetting(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first()
  return row ? String(row.value || '') : ''
}

export async function setSetting(db, key, value) {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value))
    .run()
}
