// Authentication + Employees — direct port of the matching Backend.gs sections.
import { ok, fail } from '../lib/http.js'
import {
  findEmployee, publicUser, createSession, deleteSession, audit,
  requireAuth, requireAdmin, invalidateEmployeeSessions, hashPassword, MIN_PASSWORD_LEN,
} from '../lib/auth.js'
import { genId, strictBool } from '../lib/util.js'

export async function getEmployeesForLogin(params, ctx) {
  const db = ctx.env.DB
  const { results } = await db
    .prepare('SELECT employee_id, name, password_configured FROM employees WHERE active = 1')
    .all()
  const employees = results.map((e) => ({
    employee_id: e.employee_id,
    name: e.name,
    // Every user authenticates with a password. password_configured=false means the
    // login screen shows the first-time "create password" flow for this account.
    requires_password: true,
    password_configured: strictBool(e.password_configured),
  }))
  return ok({ employees })
}

export async function login(params, ctx) {
  const db = ctx.env.DB
  const employeeId = params.employeeId
  // The password field carries the entered password on a normal login, and the chosen
  // password on a first-time setup (the client validates the confirm field).
  const password = params.password

  if (!employeeId) return fail('validation')

  const employee = await findEmployee(db, employeeId)
  if (!employee) return fail('invalid_credentials')
  if (!employee.active) return fail('employee_inactive')

  const configured = strictBool(employee.password_configured)

  if (!configured) {
    // First login: establish the user's own password now (min length enforced here,
    // not just on the frontend), then log them in.
    if (!password || String(password).length < MIN_PASSWORD_LEN) return fail('weak_password')

    const hash = await hashPassword(String(password), ctx.env.PIN_SALT)
    await db
      .prepare('UPDATE employees SET password_hash = ?, password_configured = 1 WHERE employee_id = ?')
      .bind(hash, employee.employee_id)
      .run()
    await audit(db, publicUser(employee), 'password_created', 'employee', employee.employee_id, '')
  } else {
    // Normal login: verify the previously set password.
    if (!password) return fail('validation')
    const hash = await hashPassword(String(password), ctx.env.PIN_SALT)
    if (hash !== String(employee.password_hash)) return fail('invalid_credentials')
  }

  const token = await createSession(db, employee.employee_id)
  await audit(db, publicUser(employee), 'login', 'employee', employee.employee_id, '')

  return ok({ token, user: publicUser(employee) })
}

export async function logout(params, ctx) {
  if (ctx.token) await deleteSession(ctx.env.DB, ctx.token)
  return ok({})
}

export async function validateSession(params, ctx) {
  if (!ctx.user) return fail('unauthorized')
  return ok({ user: publicUser(ctx.user) })
}

export async function getCurrentUser(params, ctx) {
  if (!ctx.user) return fail('unauthorized')
  return ok({ user: publicUser(ctx.user) })
}

export async function getEmployees(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const sql =
    ctx.user.role === 'admin'
      ? 'SELECT * FROM employees'
      : 'SELECT * FROM employees WHERE active = 1'
  const { results } = await db.prepare(sql).all()

  const employees = results.map((e) => ({
    employee_id: e.employee_id,
    name: e.name,
    role: e.role || 'employee',
    active: !!e.active,
    password_configured: strictBool(e.password_configured),
  }))
  return ok({ employees })
}

export async function saveEmployee(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const employee = params.employee || {}
  if (!employee.name) return fail('validation')

  const role = employee.role === 'admin' ? 'admin' : 'employee'
  const active = employee.active === false ? 0 : 1

  if (employee.employee_id) {
    const existing = await findEmployee(db, employee.employee_id)
    if (!existing) return fail('employee_not_found')

    // Update only name / role / active — never touch the password columns here, so an
    // edit can't clear or expose a user's self-set password.
    await db
      .prepare('UPDATE employees SET name = ?, role = ?, active = ? WHERE employee_id = ?')
      .bind(employee.name, role, active, employee.employee_id)
      .run()
    await audit(db, ctx.user, 'employee_updated', 'employee', employee.employee_id, '')
    return ok({ employee_id: employee.employee_id })
  }

  const id = genId('EMP')
  // New users have NO password yet — they set their own on first login. No shared
  // default is ever stored.
  await db
    .prepare(
      'INSERT INTO employees (employee_id, name, role, password_hash, password_configured, active) VALUES (?, ?, ?, ?, 0, ?)'
    )
    .bind(id, employee.name, role, '', active)
    .run()
  await audit(db, ctx.user, 'employee_created', 'employee', id, '')
  return ok({ employee_id: id })
}

export async function deleteEmployee(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const employeeId = params.employeeId || (params.employee && params.employee.employee_id)
  if (!employeeId) return fail('validation')

  // An admin cannot delete their own account.
  if (String(employeeId) === String(ctx.user.employee_id)) return fail('cannot_delete_self')

  const employee = await findEmployee(db, employeeId)
  if (!employee) return fail('not_found')

  await db.prepare('DELETE FROM employees WHERE employee_id = ?').bind(employeeId).run()
  await audit(db, ctx.user, 'employee_deleted', 'employee', employeeId, employee.name)
  return ok({ employee_id: employeeId })
}

// Admin: reset another user's password. The admin never sets or sees a password — the
// stored hash is cleared and the account is marked as requiring setup, so the user
// creates a new password on their next login. Existing sessions are invalidated.
export async function resetEmployeePassword(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const employeeId = params.employeeId
  if (!employeeId) return fail('validation')

  const employee = await findEmployee(db, employeeId)
  if (!employee) return fail('employee_not_found')

  await db
    .prepare("UPDATE employees SET password_hash = '', password_configured = 0 WHERE employee_id = ?")
    .bind(employeeId)
    .run()
  await invalidateEmployeeSessions(db, employeeId)
  await audit(db, ctx.user, 'employee_password_reset', 'employee', employeeId, '')
  return ok({})
}
