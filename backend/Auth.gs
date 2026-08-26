/**
 * Authentication & sessions (spec §53–§55, §61).
 * PINs are stored only as salted SHA-256 hashes. The frontend receives an opaque
 * session token, never the PIN. Every privileged action re-validates the session
 * and role server-side (spec §55) — hiding buttons in the UI is not enough.
 */

/** Public: employees for the login dropdown. No PINs, only active employees. */
function getEmployeesForLogin() {
  var list = readObjects(TABS.EMPLOYEES)
    .filter(function (e) { return String(e.active).toLowerCase() !== 'false' && e.active !== false; })
    .map(function (e) { return { employee_id: e.employee_id, name: e.name }; });
  return ok(list);
}

/** login(employeeId, pin) -> { token, user } */
function login(params) {
  var employeeId = params.employeeId;
  var pin = params.pin;
  if (!employeeId || !pin) return fail('validation');

  var emp = findEmployee(employeeId);
  if (!emp) return fail('invalid_pin');
  if (String(emp.active).toLowerCase() === 'false' || emp.active === false) {
    return fail('employee_inactive');
  }
  if (hashPin(pin) !== String(emp.pin_hash)) return fail('invalid_pin');

  var token = createSession(emp.employee_id);
  audit(publicUser(emp), 'login', 'employee', emp.employee_id, '');
  return ok({ token: token, user: publicUser(emp) });
}

/** validateSession() -> { user } for the current token, else unauthorized. */
function validateSession(params, ctx) {
  if (!ctx.user) return fail('unauthorized');
  return ok({ user: publicUser(ctx.user) });
}

function getCurrentUser(params, ctx) {
  if (!ctx.user) return fail('unauthorized');
  return ok({ user: publicUser(ctx.user) });
}

/** logout() -> removes the session row for the current token. */
function logout(params, ctx) {
  if (ctx.token) deleteSession(ctx.token);
  return ok({});
}

/* ---------------- internal helpers ---------------- */

function findEmployee(employeeId) {
  var list = readObjects(TABS.EMPLOYEES);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].employee_id) === String(employeeId)) return list[i];
  }
  return null;
}

function publicUser(emp) {
  return { employee_id: emp.employee_id, name: emp.name, role: emp.role || 'employee' };
}

function createSession(employeeId) {
  var token = Utilities.getUuid() + Utilities.getUuid().substring(0, 8);
  var created = new Date();
  var expires = new Date(created.getTime() + SESSION_TTL_DAYS * 86400000);
  getTab(TABS.SESSIONS).appendRow([
    token,
    employeeId,
    Utilities.formatDate(created, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"),
    Utilities.formatDate(expires, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"),
  ]);
  return token;
}

/** Resolve a token to a live employee object, or null if invalid/expired. */
function resolveSession(token) {
  if (!token) return null;
  var sessions = readObjects(TABS.SESSIONS);
  var now = new Date();
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].token) === String(token)) {
      var exp = new Date(sessions[i].expires_at);
      if (exp < now) return null;
      return findEmployee(sessions[i].employee_id);
    }
  }
  return null;
}

function deleteSession(token) {
  var sheet = getTab(TABS.SESSIONS);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(token)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

/** Throw-style guards used by handlers. Return null when OK, else a fail() code. */
function requireAuth(ctx) {
  return ctx.user ? null : fail('unauthorized');
}

function requireAdmin(ctx) {
  if (!ctx.user) return fail('unauthorized');
  if ((ctx.user.role || 'employee') !== 'admin') return fail('forbidden');
  return null;
}
