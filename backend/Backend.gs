/**
 * ============================================================================
 * FLEET PLATFORM BACKEND
 * Google Apps Script Web App
 *
 * ARCHITECTURE
 *
 * Fleet App Data Sheet
 *   - Employees
 *   - Locations
 *   - Sessions
 *   - Settings
 *   - Audit
 *   - Cars
 *   - UsageHistory
 *   - Maintenance
 *   - Documents
 *   - Availability
 *
 * External Schedule Sheet
 *   - READ ONLY
 *   - Existing management schedule / cloned testing copy
 *
 * Frontend -> Apps Script API -> Google Sheets
 *
 * Timezone: Europe/Sofia
 * ============================================================================
 */


/* ============================================================================
 * CONFIG
 * ========================================================================== */

var TIMEZONE = 'Europe/Sofia';
var SESSION_TTL_DAYS = 30;

// Bump on every meaningful backend change. Visible via doGet (open the /exec URL in a
// browser) so you can confirm which code the DEPLOYED web app is actually running —
// Apps Script serves the last DEPLOYED VERSION, not merely the saved script.
var BACKEND_VERSION = '2026-08-28-schedule-probe';

// Each completed delivery order is worth this much toward the worker's weekly pay.
var ORDER_RATE_EUR = 0.5;

// Safety equipment confirmed when a car is taken (usage-history flags).
var SAFETY_EQUIPMENT_FIELDS = [
  'has_fire_extinguisher',
  'has_first_aid_kit',
  'has_warning_triangle',
  'has_safety_vest'
];

// Short server-side cache for the external schedule grid. Reading another Google Sheet
// through Apps Script is slow, so cache the raw matrix; background polls reuse it, while
// an explicit admin refresh (params.refresh) or a source change bypasses it. The schedule
// changes rarely (weekly), so a short TTL just re-ran the heavy external read for every
// 45s auto-refresh of every user — a frequent source of 503s. A longer TTL means the
// external sheet is read at most once per window; the manual "refresh" button stays
// available for the rare mid-window change.
var SCHEDULE_CACHE_TTL_SEC = 1800; // 30 min
var SCHEDULE_CACHE_PREFIX = 'schedule_raw:';

// Administration belongs to these real named users — there is no shared admin account.
// migrateAdminsAndAuth() promotes any that exist to the 'admin' role and creates the
// MUST_EXIST ones if missing. Маги is a review-only admin (full admin rights, same as
// ЦЕЦО/СИМО below) — NOT added to AVAILABILITY_WORKER_ADMINS, so she gets the same
// permissions as ЦЕЦО, not the worker-admin behavior of ПАВЕЛ/В. ПЕТКОВ.
var ADMIN_USER_NAMES = ['ЦЕЦО', 'СИМО', 'ПАВЕЛ', 'В. ПЕТКОВ', 'Маги'];
var ADMIN_MUST_EXIST = ['ЦЕЦО', 'СИМО', 'Маги'];
// Admins who ALSO work shifts and may therefore submit their own availability. Other
// admins (ЦЕЦО, СИМО) only review the team and cannot submit.
var AVAILABILITY_WORKER_ADMINS = ['ПАВЕЛ', 'В. ПЕТКОВ'];
// The generic shared account to retire once real admins are in place.
var LEGACY_ADMIN_NAME = 'Администратор';

// Distance driven since the last oil change after which the car is flagged (soft,
// non-blocking) as needing an oil change.
var OIL_CHANGE_INTERVAL_KM = 10000;

/**
 * IMPORTANT:
 * Put the URL of your CLONED schedule here for testing.
 *
 * Example:
 * https://docs.google.com/spreadsheets/d/ABC123/edit?gid=123456#gid=123456
 */
var INITIAL_SCHEDULE_URL = 'PASTE_YOUR_CLONED_SCHEDULE_URL_HERE';


var TABS = {
  EMPLOYEES: 'Employees',
  LOCATIONS: 'Locations',
  SESSIONS: 'Sessions',
  SETTINGS: 'Settings',
  AUDIT: 'Audit',

  CARS: 'Cars',
  USAGE: 'UsageHistory',
  MAINTENANCE: 'Maintenance',
  DOCUMENTS: 'Documents',
  AVAILABILITY: 'Availability',

  ORDERS: 'Orders',
  FUEL: 'FuelExpenses',
  REPORTS: 'DailyReports',
  PAYROLL: 'Payroll'
};


var DEFAULT_HEADERS = {

  // Authentication is password-based (per-user, self-set on first login). The legacy
  // 'pin_hash' column is left untouched on already-deployed sheets; new sheets use
  // 'password_hash' + 'password_configured'. See migrateAdminsAndAuth().
  Employees: [
    'employee_id',
    'name',
    'role',
    'password_hash',
    'password_configured',
    'active'
  ],

  Locations: [
    'location_id',
    'name',
    'address',
    'latitude',
    'longitude',
    'active'
  ],

  Sessions: [
    'token',
    'employee_id',
    'created_at',
    'expires_at'
  ],

  Settings: [
    'key',
    'value'
  ],

  Audit: [
    'audit_id',
    'timestamp',
    'employee_id',
    'employee_name',
    'action',
    'entity_type',
    'entity_id',
    'details'
  ],

  Cars: [
    'car_id',
    'registration',
    'make',
    'model',
    'year',
    'image',
    'status',
    'current_driver_id',
    'current_driver_name',
    'current_usage_id',
    'parked_location',
    'notes',
    'active',
    'last_odometer',
    'last_oil_change_odometer',
    'last_oil_change_date',
    'fuel_cash_start',
    'fuel_spent_total'
  ],

  UsageHistory: [
    'usage_id',
    'car_id',
    'registration',
    'employee_id',
    'employee_name',
    'start_at',
    'end_at',
    'parked_location',
    'notes',
    'fuel_cash_start',
    'fuel_spent_total',
    'fuel_cash_remaining',
    'has_fire_extinguisher',
    'has_first_aid_kit',
    'has_warning_triangle',
    'has_safety_vest'
  ],

  Maintenance: [
    'maintenance_id',
    'car_id',
    'registration',
    'reported_by_id',
    'reported_by_name',
    'reported_at',
    'title',
    'description',
    'category',
    'severity',
    'status',
    'resolved_at',
    'resolved_by_id',
    'resolved_by_name',
    'repair_description',
    'service',
    'cost',
    'notes'
  ],

  Documents: [
    'document_id',
    'car_id',
    'registration',
    'type',
    'provider',
    'document_number',
    'valid_from',
    'valid_until',
    'warning_days',
    'notes'
  ],

  Availability: [
    'availability_id',
    'employee_id',
    'employee_name',
    'week_start',
    'date',
    'shift_type',
    'updated_at'
  ],

  Orders: [
    'order_record_id',
    'employee_id',
    'employee_name',
    'date',
    'week_start',
    'restaurant',
    'shift_type',
    'order_count',
    'order_salary',
    'updated_at'
  ],

  FuelExpenses: [
    'fuel_entry_id',
    'car_id',
    'registration',
    'employee_id',
    'employee_name',
    'usage_id',
    'amount',
    'date',
    'week_start',
    'created_at',
    'notes'
  ],

  DailyReports: [
    'report_id',
    'employee_id',
    'employee_name',
    'date',
    'week_start',
    'restaurant',
    'delivery_type',
    'amount',
    'updated_at'
  ],

  Payroll: [
    'payroll_id',
    'employee_id',
    'employee_name',
    'week_start',
    'base_salary',
    'orders_count',
    'orders_salary',
    'fuel_salary',
    'final_amount',
    'paid',
    'paid_at',
    'paid_by_id',
    'paid_by_name',
    'received_confirmed',
    'received_confirmed_at',
    'updated_at'
  ]
};


/* ============================================================================
 * DATASTORE
 * ========================================================================== */

/**
 * setup() stores the ID of the Fleet App Data spreadsheet here.
 * This is safer than relying on getActiveSpreadsheet() in web app execution.
 */
function getDataStore() {

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DATASTORE_SPREADSHEET_ID');

  if (id) {
    return SpreadsheetApp.openById(id);
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();

  if (!active) {
    throw new Error('Fleet datastore is not configured. Run setup() first.');
  }

  props.setProperty('DATASTORE_SPREADSHEET_ID', active.getId());

  return active;
}


function getTab(name) {

  var ss = getDataStore();

  var sheet = ss.getSheetByName(name);

  if (!sheet) {

    sheet = ss.insertSheet(name);

    var headers = DEFAULT_HEADERS[name];

    if (headers) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}


// Return the 1-based index of a header column, creating it if it does not exist yet.
// Lets us add columns (e.g. odometer fields) to an already-deployed sheet on the fly.
function ensureColumn(sheet, headerName) {

  var lastCol = sheet.getLastColumn();

  var headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function(h) { return String(h).trim(); });

  var idx = headers.indexOf(headerName);

  if (idx >= 0) {
    return idx + 1;
  }

  sheet.getRange(1, lastCol + 1).setValue(headerName);
  return lastCol + 1;
}


function readObjects(name) {

  var sheet = getTab(name);

  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  var headers = values[0].map(function(h) {
    return String(h).trim();
  });

  var output = [];

  for (var i = 1; i < values.length; i++) {

    var row = values[i];

    var empty = row.every(function(cell) {
      return cell === '' || cell === null;
    });

    if (empty) {
      continue;
    }

    var obj = {};

    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }

    obj.__row = i + 1;

    output.push(obj);
  }

  return output;
}


/* ============================================================================
 * COMMON UTILITIES
 * ========================================================================== */

function ok(data) {
  return {
    ok: true,
    data: data === undefined ? {} : data
  };
}


function fail(code, extra) {

  var result = {
    ok: false,
    error: code || 'server_error'
  };

  if (extra) {
    result.details = extra;
  }

  return result;
}


function genId(prefix) {

  var random = Utilities
    .getUuid()
    .replace(/-/g, '')
    .substring(0, 10);

  return prefix + '-' + random;
}


function nowStamp() {

  return Utilities.formatDate(
    new Date(),
    TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}


function dateOnly(date) {

  return Utilities.formatDate(
    date,
    TIMEZONE,
    'yyyy-MM-dd'
  );
}


// Monday (yyyy-MM-dd) of the ISO week containing `iso`. Pure calendar math in UTC so it
// is independent of the script's timezone. Matches the frontend's week_start convention.
function mondayOfISO(iso) {

  var s = normalizeIsoDate(iso);

  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    return s;
  }

  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  var wd = d.getUTCDay(); // 0=Sun..6=Sat
  var diff = (wd === 0) ? -6 : (1 - wd);
  d.setUTCDate(d.getUTCDate() + diff);

  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}


/**
 * Normalize any date-ish value to a Sofia-local yyyy-MM-dd string.
 * Google Sheets coerces stored "yyyy-MM-dd" strings into Date cells, so values
 * read back are Dates (or UTC ISO once serialized). This recovers the intended
 * calendar date in Sofia time.
 */
function normalizeIsoDate(value) {

  if (value === '' || value == null) {
    return '';
  }

  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }

  var s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  var d = new Date(s);

  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }

  return s;
}


function normalizeBoolean(value) {

  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  var str = String(value).toLowerCase().trim();

  return !(
    str === 'false' ||
    str === '0' ||
    str === 'no' ||
    str === 'не'
  );
}


function withLock(fn) {

  var lock = LockService.getScriptLock();

  lock.waitLock(15000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================================
 * SETTINGS
 * ========================================================================== */

function getSetting(key) {

  var rows = readObjects(TABS.SETTINGS);

  for (var i = 0; i < rows.length; i++) {

    if (String(rows[i].key).trim() === String(key).trim()) {
      return String(rows[i].value || '');
    }
  }

  return '';
}


function setSetting(key, value) {

  var sheet = getTab(TABS.SETTINGS);

  var rows = readObjects(TABS.SETTINGS);

  for (var i = 0; i < rows.length; i++) {

    if (String(rows[i].key).trim() === String(key).trim()) {

      sheet
        .getRange(rows[i].__row, 2)
        .setValue(value);

      return;
    }
  }

  sheet.appendRow([
    key,
    value
  ]);
}


/* ============================================================================
 * PIN HASHING
 * ========================================================================== */

/**
 * PIN salt is stored in Script Properties.
 * It is NOT committed to GitHub and does NOT live in frontend code.
 */
function getPinSalt() {

  var props = PropertiesService.getScriptProperties();

  var salt = props.getProperty('PIN_SALT');

  if (!salt) {

    salt =
      Utilities.getUuid() +
      Utilities.getUuid() +
      Utilities.getUuid();

    props.setProperty('PIN_SALT', salt);
  }

  return salt;
}


function hashPin(pin) {

  var salt = getPinSalt();

  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + String(pin),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(b) {

    var value = b < 0 ? b + 256 : b;

    var hex = value.toString(16);

    return hex.length === 1
      ? '0' + hex
      : hex;

  }).join('');
}


// Passwords use the same salted SHA-256 as the legacy PIN hashing (the stored salt is
// reused), so only a secure hash is ever persisted — never the plain-text password.
var MIN_PASSWORD_LEN = 6;

function hashPassword(password) {
  return hashPin(password);
}

// Strict truthiness for the password_configured flag: a BLANK cell must read as
// "not configured" (normalizeBoolean treats '' as true, which is wrong here).
function isConfiguredFlag(value) {
  if (value === true) {
    return true;
  }
  var s = String(value).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'да';
}

// Header-aware writes so auth columns work regardless of physical column order on
// already-deployed sheets (which still carry the old 'pin_hash' column).
function setRowCells(sheet, row, obj) {
  Object.keys(obj).forEach(function(header) {
    sheet.getRange(row, ensureColumn(sheet, header)).setValue(obj[header]);
  });
}

function appendRowByHeaders(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var row = headers.map(function(h) {
    return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
  });
  sheet.appendRow(row);
}


/* ============================================================================
 * AUDIT
 * ========================================================================== */

function audit(user, action, entityType, entityId, details) {

  try {

    getTab(TABS.AUDIT).appendRow([

      genId('AUD'),

      nowStamp(),

      user
        ? user.employee_id
        : '',

      user
        ? user.name
        : '',

      action || '',

      entityType || '',

      entityId || '',

      details || ''
    ]);

  } catch (e) {

    console.error(
      'Audit failure:',
      e
    );
  }
}


/* ============================================================================
 * EMPLOYEES
 * ========================================================================== */

function findEmployee(employeeId) {

  var rows = readObjects(TABS.EMPLOYEES);

  for (var i = 0; i < rows.length; i++) {

    if (
      String(rows[i].employee_id) ===
      String(employeeId)
    ) {
      return rows[i];
    }
  }

  return null;
}


// Whether a user may submit their own shift availability. Regular staff always can;
// admins can only if they're on the worker-admin list (they also work shifts).
function canSubmitAvailability(user) {
  if (!user) return false;
  if (String(user.role) !== 'admin') return true;
  for (var i = 0; i < AVAILABILITY_WORKER_ADMINS.length; i++) {
    if (nameKeyBG(user.name) === nameKeyBG(AVAILABILITY_WORKER_ADMINS[i])) {
      return true;
    }
  }
  return false;
}


function publicUser(employee) {

  return {
    employee_id: employee.employee_id,
    name: employee.name,
    role: employee.role || 'employee',
    // Lets the frontend show the "my availability" editor to worker-admins too.
    can_submit_availability: canSubmitAvailability(employee)
  };
}


function getEmployeesForLogin() {

  var employees = readObjects(TABS.EMPLOYEES)

    .filter(function(employee) {
      return normalizeBoolean(employee.active);
    })

    .map(function(employee) {

      return {
        employee_id: employee.employee_id,
        name: employee.name,
        // Every user authenticates with a password. password_configured=false means the
        // login screen shows the first-time "create password" flow for this account.
        requires_password: true,
        password_configured: isConfiguredFlag(employee.password_configured)
      };
    });

  return ok({
    employees: employees
  });
}


function getEmployees(params, ctx) {

  var unauth = requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var employees = readObjects(TABS.EMPLOYEES)

    .filter(function(employee) {

      if (ctx.user.role === 'admin') {
        return true;
      }

      return normalizeBoolean(employee.active);
    })

    .map(function(employee) {

      return {
        employee_id: employee.employee_id,
        name: employee.name,
        role: employee.role || 'employee',
        active: normalizeBoolean(employee.active),
        // Password status for the admin panel — a boolean only, never the hash.
        password_configured: isConfiguredFlag(employee.password_configured)
      };
    });

  return ok({
    employees: employees
  });
}


function saveEmployee(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var employee = params.employee || {};

  if (!employee.name) {
    return fail('validation');
  }

  var role =
    employee.role === 'admin'
      ? 'admin'
      : 'employee';

  var sheet = getTab(TABS.EMPLOYEES);

  if (employee.employee_id) {

    var existing = findEmployee(
      employee.employee_id
    );

    if (!existing) {
      return fail('employee_not_found');
    }

    // Update only name / role / active — never touch the password columns here, so an
    // edit can't clear or expose a user's self-set password.
    setRowCells(sheet, existing.__row, {
      name: employee.name,
      role: role,
      active: employee.active === false ? false : true
    });

    audit(
      ctx.user,
      'employee_updated',
      'employee',
      employee.employee_id,
      ''
    );

    return ok({
      employee_id: employee.employee_id
    });
  }

  var id = genId('EMP');

  // New users have NO password yet — they set their own on first login. No shared
  // default is ever stored.
  appendRowByHeaders(sheet, {
    employee_id: id,
    name: employee.name,
    role: role,
    password_hash: '',
    password_configured: false,
    active: employee.active === false ? false : true
  });

  audit(
    ctx.user,
    'employee_created',
    'employee',
    id,
    ''
  );

  return ok({
    employee_id: id
  });
}


function deleteEmployee(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var employeeId =
    params.employeeId ||
    (params.employee && params.employee.employee_id);

  if (!employeeId) {
    return fail('validation');
  }

  // An admin cannot delete their own account.
  if (String(employeeId) === String(ctx.user.employee_id)) {
    return fail('cannot_delete_self');
  }

  var employee = findEmployee(employeeId);

  if (!employee) {
    return fail('not_found');
  }

  getTab(TABS.EMPLOYEES).deleteRow(employee.__row);

  audit(
    ctx.user,
    'employee_deleted',
    'employee',
    employeeId,
    employee.name
  );

  return ok({
    employee_id: employeeId
  });
}


// Admin: reset another user's password. The admin never sets or sees a password —
// the stored hash is cleared and the account is marked as requiring setup, so the user
// creates a new password on their next login. Existing sessions are invalidated.
function resetEmployeePassword(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var employeeId =
    params.employeeId;

  if (!employeeId) {
    return fail('validation');
  }

  var employee = findEmployee(employeeId);

  if (!employee) {
    return fail('employee_not_found');
  }

  var sheet = getTab(TABS.EMPLOYEES);

  setRowCells(sheet, employee.__row, {
    password_hash: '',
    password_configured: false
  });

  invalidateEmployeeSessions(employeeId);

  audit(
    ctx.user,
    'employee_password_reset',
    'employee',
    employeeId,
    ''
  );

  return ok({});
}


// Remove every active session for an employee (used on password reset).
function invalidateEmployeeSessions(employeeId) {

  var sheet = getTab(TABS.SESSIONS);

  var sessions = readObjects(TABS.SESSIONS);

  var rows = [];

  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].employee_id) === String(employeeId)) {
      rows.push(sessions[i].__row);
    }
  }

  rows
    .sort(function(a, b) { return b - a; })
    .forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });
}


/* ============================================================================
 * AUTHENTICATION
 * ========================================================================== */

function login(params) {

  var employeeId =
    params.employeeId;

  // The password field carries the entered password on a normal login, and the chosen
  // password on a first-time setup (the client validates the confirm field).
  var password =
    params.password;

  if (!employeeId) {
    return fail('validation');
  }

  var employee =
    findEmployee(employeeId);

  if (!employee) {
    return fail('invalid_credentials');
  }

  if (!normalizeBoolean(employee.active)) {
    return fail('employee_inactive');
  }

  // Every user authenticates with a personal password.
  var configured = isConfiguredFlag(employee.password_configured);

  if (!configured) {

    // First login: establish the user's own password now (min length enforced here,
    // not just on the frontend), then log them in.
    if (!password || String(password).length < MIN_PASSWORD_LEN) {
      return fail('weak_password');
    }

    var sheet = getTab(TABS.EMPLOYEES);

    setRowCells(sheet, employee.__row, {
      password_hash: hashPassword(String(password)),
      password_configured: true
    });

    audit(
      publicUser(employee),
      'password_created',
      'employee',
      employee.employee_id,
      ''
    );

  } else {

    // Normal login: verify the previously set password.
    if (!password) {
      return fail('validation');
    }

    if (
      hashPassword(String(password)) !==
      String(employee.password_hash)
    ) {
      return fail('invalid_credentials');
    }
  }

  var token =
    createSession(employee.employee_id);

  audit(
    publicUser(employee),
    'login',
    'employee',
    employee.employee_id,
    ''
  );

  return ok({

    token: token,

    user: publicUser(employee)
  });
}


function createSession(employeeId) {

  var token =
    Utilities.getUuid() +
    Utilities.getUuid();

  var created =
    new Date();

  var expires =
    new Date(
      created.getTime() +
      SESSION_TTL_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  getTab(TABS.SESSIONS)
    .appendRow([

      token,

      employeeId,

      Utilities.formatDate(
        created,
        TIMEZONE,
        "yyyy-MM-dd'T'HH:mm:ss"
      ),

      Utilities.formatDate(
        expires,
        TIMEZONE,
        "yyyy-MM-dd'T'HH:mm:ss"
      )
    ]);

  return token;
}


function resolveSession(token) {

  if (!token) {
    return null;
  }

  var sessions =
    readObjects(TABS.SESSIONS);

  var now =
    new Date();

  for (
    var i = 0;
    i < sessions.length;
    i++
  ) {

    if (
      String(sessions[i].token) ===
      String(token)
    ) {

      var expires =
        new Date(
          sessions[i].expires_at
        );

      if (
        isNaN(expires.getTime()) ||
        expires < now
      ) {
        return null;
      }

      var employee =
        findEmployee(
          sessions[i].employee_id
        );

      if (
        !employee ||
        !normalizeBoolean(employee.active)
      ) {
        return null;
      }

      return employee;
    }
  }

  return null;
}


function deleteSession(token) {

  var sheet =
    getTab(TABS.SESSIONS);

  var sessions =
    readObjects(TABS.SESSIONS);

  for (
    var i = sessions.length - 1;
    i >= 0;
    i--
  ) {

    if (
      String(sessions[i].token) ===
      String(token)
    ) {

      sheet.deleteRow(
        sessions[i].__row
      );

      return;
    }
  }
}


function logout(params, ctx) {

  if (ctx.token) {
    deleteSession(ctx.token);
  }

  return ok({});
}


function validateSession(params, ctx) {

  if (!ctx.user) {
    return fail('unauthorized');
  }

  return ok({
    user: publicUser(ctx.user)
  });
}


function getCurrentUser(params, ctx) {

  if (!ctx.user) {
    return fail('unauthorized');
  }

  return ok({
    user: publicUser(ctx.user)
  });
}


function requireAuth(ctx) {

  if (!ctx.user) {
    return fail('unauthorized');
  }

  return null;
}


function requireAdmin(ctx) {

  if (!ctx.user) {
    return fail('unauthorized');
  }

  if (
    String(ctx.user.role) !== 'admin'
  ) {
    return fail('forbidden');
  }

  return null;
}


// Guard for actions that record PERSONAL work data (orders, reports, fuel, payment
// confirmation). Allowed for regular staff and worker-admins (ПАВЕЛ, В. ПЕТКОВ), but not
// review-only admins (ЦЕЦО, СИМО) — the same capability as submitting availability.
function requireWorker(ctx) {

  if (!ctx.user) {
    return fail('unauthorized');
  }

  if (!canSubmitAvailability(ctx.user)) {
    return fail('forbidden');
  }

  return null;
}


/* ============================================================================
 * LOCATIONS
 * ========================================================================== */

function getLocations(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var includeInactive =
    params &&
    params.includeInactive &&
    ctx.user.role === 'admin';

  var rows =
    readObjects(TABS.LOCATIONS);

  var locations =
    rows
      .filter(function(location) {

        if (includeInactive) {
          return true;
        }

        return normalizeBoolean(
          location.active
        );
      })

      .map(function(location) {

        return {

          location_id:
            location.location_id,

          name:
            location.name,

          address:
            location.address || '',

          latitude:
            location.latitude === ''
              ? null
              : Number(location.latitude),

          longitude:
            location.longitude === ''
              ? null
              : Number(location.longitude),

          active:
            normalizeBoolean(
              location.active
            )
        };
      });

  return ok({
    locations: locations
  });
}


function saveLocation(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var location =
    params.location || {};

  if (!location.name) {
    return fail('validation');
  }

  var sheet =
    getTab(TABS.LOCATIONS);

  var rows =
    readObjects(TABS.LOCATIONS);

  if (location.location_id) {

    for (
      var i = 0;
      i < rows.length;
      i++
    ) {

      if (
        String(rows[i].location_id) ===
        String(location.location_id)
      ) {

        sheet.getRange(
          rows[i].__row,
          1,
          1,
          6
        ).setValues([[
          location.location_id,
          location.name,
          location.address || '',
          location.latitude != null
            ? location.latitude
            : '',
          location.longitude != null
            ? location.longitude
            : '',
          location.active === false
            ? false
            : true
        ]]);

        audit(
          ctx.user,
          'location_updated',
          'location',
          location.location_id,
          ''
        );

        return ok({
          location_id:
            location.location_id
        });
      }
    }
  }

  var id =
    genId('LOC');

  sheet.appendRow([

    id,

    location.name,

    location.address || '',

    location.latitude != null
      ? location.latitude
      : '',

    location.longitude != null
      ? location.longitude
      : '',

    location.active === false
      ? false
      : true
  ]);

  audit(
    ctx.user,
    'location_created',
    'location',
    id,
    ''
  );

  return ok({
    location_id: id
  });
}


/* ============================================================================
 * EXTERNAL SCHEDULE
 *
 * IMPORTANT:
 * THE APPLICATION NEVER WRITES TO THIS SPREADSHEET.
 * ========================================================================== */

function extractSpreadsheetId(url) {

  if (!url) {
    return null;
  }

  var match =
    String(url)
      .match(
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
      );

  return match
    ? match[1]
    : null;
}


function extractSheetGid(url) {

  if (!url) {
    return null;
  }

  var match =
    String(url)
      .match(
        /[?&#]gid=(\d+)/
      );

  return match
    ? Number(match[1])
    : null;
}


function getScheduleSheetFromUrl(url) {

  var spreadsheetId =
    extractSpreadsheetId(url);

  if (!spreadsheetId) {
    return null;
  }

  var spreadsheet =
    SpreadsheetApp.openById(
      spreadsheetId
    );

  var configuredTab =
    getSetting(
      'schedule_tab_name'
    );

  if (configuredTab) {

    var configuredSheet =
      spreadsheet.getSheetByName(
        configuredTab
      );

    if (configuredSheet) {
      return configuredSheet;
    }
  }


  /**
   * If no explicit tab name is configured,
   * use gid from the URL.
   */
  var gid =
    extractSheetGid(url);

  if (gid !== null) {

    var sheets =
      spreadsheet.getSheets();

    for (
      var i = 0;
      i < sheets.length;
      i++
    ) {

      if (
        sheets[i].getSheetId() ===
        gid
      ) {
        return sheets[i];
      }
    }
  }


  /**
   * Final fallback:
   * first tab.
   */
  var allSheets =
    spreadsheet.getSheets();

  return allSheets.length
    ? allSheets[0]
    : null;
}


function getScheduleSource(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  return ok({

    url:
      getSetting(
        'current_schedule_sheet_url'
      ),

    tab_name:
      getSetting(
        'schedule_tab_name'
      )
  });
}


function setScheduleSource(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var url =
    String(params.url || '')
      .trim();

  if (
    !extractSpreadsheetId(url)
  ) {
    return fail('validation');
  }

  try {

    var sheet =
      getScheduleSheetFromUrl(url);

    if (!sheet) {
      return fail(
        'schedule_load_failed'
      );
    }

  } catch (e) {

    console.error(e);

    return fail(
      'schedule_load_failed'
    );
  }

  setSetting(
    'current_schedule_sheet_url',
    url
  );

  if (
    params.tabName !== undefined
  ) {

    setSetting(
      'schedule_tab_name',
      params.tabName || ''
    );
  }

  clearScheduleCache(); // source changed — don't serve the previous grid

  audit(
    ctx.user,
    'schedule_source_changed',
    'settings',
    'current_schedule_sheet_url',
    url
  );

  return ok({
    url: url
  });
}


/**
 * Returns the COMPLETE schedule grid.
 *
 * This is useful while we adapt the parser
 * to the actual management schedule structure.
 */
function getScheduleRaw(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var url =
    getSetting(
      'current_schedule_sheet_url'
    );

  if (!url) {

    return ok({
      configured: false,
      rows: [],
      matrix: []
    });
  }

  // Diagnostic probe: report the sheet's dimensions using cheap metadata (no cell read,
  // so it can't 503 the way a full getDisplayValues() does). Lets us see why the full
  // read is failing without pulling the whole grid.
  if (params && params.probe === true) {
    var ps = getScheduleSheetFromUrl(url);
    if (!ps) return fail('schedule_load_failed');
    return ok({
      probe: true,
      sheet_name: ps.getName(),
      last_row: ps.getLastRow(),
      last_col: ps.getLastColumn(),
      max_rows: ps.getMaxRows(),
      max_cols: ps.getMaxColumns()
    });
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = SCHEDULE_CACHE_PREFIX + url;
  var forceRefresh = params && params.refresh === true;

  // Serve a recent cached copy unless the caller explicitly asked to refresh.
  if (!forceRefresh) {
    var cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(decodeScheduleCache(cached));
      } catch (e) {
        /* corrupt cache entry — fall through and re-read */
      }
    }
  }

  try {

    var sheet =
      getScheduleSheetFromUrl(
        url
      );

    if (!sheet) {
      return fail(
        'schedule_load_failed'
      );
    }

    /**
     * getDisplayValues() is intentionally used.
     *
     * This preserves the human-visible values
     * of the management schedule.
     */
    var matrix =
      sheet
        .getDataRange()
        .getDisplayValues();

    // getDataRange() returns the whole USED range, which on a management schedule sheet is
    // usually a small data block inside a large formatted-but-empty area. Serializing all
    // of it produced a response too big for Apps Script to deliver (a ~4s build then a 503).
    // Trim trailing empty rows/columns — lossless (empty cells carry no schedule data) and
    // it keeps the top-left origin so the client parser is unaffected.
    matrix = trimScheduleMatrix(matrix);

    var result = ok({

      configured: true,

      spreadsheet_id:
        extractSpreadsheetId(url),

      gid:
        sheet.getSheetId(),

      sheet_name:
        sheet.getName(),

      row_count:
        matrix.length,

      column_count:
        matrix.length
          ? matrix[0].length
          : 0,

      matrix:
        matrix
    });

    // Cache the result. CacheService caps values at 100KB, and a full schedule grid can
    // exceed that uncompressed — in which case it would NEVER cache and every request would
    // re-open the heavy external sheet (a frequent source of 503s under load). Gzip the
    // JSON (schedule text compresses well) so it fits and the external read runs at most
    // once per TTL. Falls back to a plain write for small payloads.
    try {
      var serialized = JSON.stringify(result);
      var encoded = encodeScheduleCache(serialized);
      if (encoded && encoded.length < 95000) {
        cache.put(cacheKey, encoded, SCHEDULE_CACHE_TTL_SEC);
      } else if (serialized.length < 95000) {
        cache.put(cacheKey, serialized, SCHEDULE_CACHE_TTL_SEC);
      }
    } catch (e) {
      /* caching is best-effort; never fail the request over it */
    }

    return result;

  } catch (e) {

    console.error(e);

    return fail(
      'schedule_load_failed'
    );
  }
}


// Drop trailing all-empty rows and columns from a 2D display-value grid, preserving the
// top-left origin. Collapses the huge empty formatted areas that getDataRange() picks up
// so the schedule response stays small enough for Apps Script to deliver.
function trimScheduleMatrix(matrix) {
  if (!matrix || !matrix.length) return matrix || [];

  var nonEmpty = function(v) { return String(v == null ? '' : v).trim() !== ''; };

  var lastRow = -1;
  for (var r = 0; r < matrix.length; r++) {
    var row = matrix[r] || [];
    for (var c = 0; c < row.length; c++) {
      if (nonEmpty(row[c])) { lastRow = r; break; }
    }
  }
  if (lastRow < 0) return [];

  var lastCol = -1;
  for (var r2 = 0; r2 <= lastRow; r2++) {
    var row2 = matrix[r2] || [];
    for (var c2 = row2.length - 1; c2 > lastCol; c2--) {
      if (nonEmpty(row2[c2])) { lastCol = c2; break; }
    }
  }
  if (lastCol < 0) return [];

  var out = [];
  for (var r3 = 0; r3 <= lastRow; r3++) {
    out.push((matrix[r3] || []).slice(0, lastCol + 1));
  }
  return out;
}


// Gzip + base64 a string for CacheService storage, tagged so the reader knows to inflate.
// Returns null if compression fails (caller then falls back to a plain write).
function encodeScheduleCache(serialized) {
  try {
    var gz = Utilities.gzip(Utilities.newBlob(serialized, 'application/json')).getBytes();
    return 'gz:' + Utilities.base64Encode(gz);
  } catch (e) {
    return null;
  }
}

// Inverse of encodeScheduleCache. Plain (untagged) entries are returned as-is so older
// cache writes and small plain payloads still decode.
function decodeScheduleCache(cached) {
  if (cached && cached.indexOf('gz:') === 0) {
    var bytes = Utilities.base64Decode(cached.substring(3));
    return Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString();
  }
  return cached;
}


// Drop the cached schedule grid (called when the source sheet changes).
function clearScheduleCache() {
  try {
    var url = getSetting('current_schedule_sheet_url');
    if (url) CacheService.getScriptCache().remove(SCHEDULE_CACHE_PREFIX + url);
  } catch (e) {
    /* best-effort */
  }
}


/**
 * Generic row parser.
 *
 * This works automatically when row 1 contains column headers.
 *
 * It does NOT modify the original schedule.
 *
 * Once we know the exact cloned schedule layout,
 * this function can be replaced with a custom parser.
 */
function readScheduleRows() {

  var url =
    getSetting(
      'current_schedule_sheet_url'
    );

  if (!url) {

    return ok({
      rows: [],
      configured: false
    });
  }

  try {

    var sheet =
      getScheduleSheetFromUrl(
        url
      );

    if (!sheet) {
      return fail(
        'schedule_load_failed'
      );
    }

    var values =
      sheet
        .getDataRange()
        .getValues();

    var display =
      sheet
        .getDataRange()
        .getDisplayValues();

    if (
      !values.length ||
      values.length < 2
    ) {

      return ok({
        rows: [],
        configured: true
      });
    }

    var headers =
      display[0].map(
        function(header, index) {

          var value =
            String(header || '')
              .trim()
              .toLowerCase();

          value =
            value
              .replace(/[^\p{L}\p{N}]+/gu, '_')
              .replace(/^_+|_+$/g, '');

          if (!value) {
            value =
              'column_' +
              (index + 1);
          }

          return value;
        }
      );


    var rows = [];


    for (
      var rowIndex = 1;
      rowIndex < values.length;
      rowIndex++
    ) {

      var rawRow =
        values[rowIndex];

      var displayRow =
        display[rowIndex];


      var empty =
        displayRow.every(
          function(cell) {
            return String(cell).trim() === '';
          }
        );

      if (empty) {
        continue;
      }


      var obj = {

        __sheet_row:
          rowIndex + 1
      };


      for (
        var col = 0;
        col < headers.length;
        col++
      ) {

        var rawValue =
          rawRow[col];

        var visibleValue =
          displayRow[col];


        if (
          rawValue instanceof Date
        ) {

          obj[headers[col]] =
            Utilities.formatDate(
              rawValue,
              TIMEZONE,
              'yyyy-MM-dd'
            );

        } else {

          /**
           * Prefer displayed value because
           * this matches what employees see
           * in the original schedule.
           */
          obj[headers[col]] =
            visibleValue;
        }
      }


      rows.push(obj);
    }


    return ok({

      configured: true,

      sheet_name:
        sheet.getName(),

      gid:
        sheet.getSheetId(),

      rows:
        rows
    });


  } catch (e) {

    console.error(e);

    return fail(
      'schedule_load_failed'
    );
  }
}


function getSchedule(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  return readScheduleRows();
}


function refreshSchedule(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  return readScheduleRows();
}


/* ============================================================================
 * CARS
 * ========================================================================== */

function findCar(carId) {

  var rows =
    readObjects(TABS.CARS);

  for (
    var i = 0;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i].car_id) ===
      String(carId)
    ) {
      return rows[i];
    }
  }

  return null;
}


function serializeCar(car) {

  return {

    car_id:
      car.car_id,

    registration:
      car.registration,

    make:
      car.make || '',

    model:
      car.model || '',

    year:
      car.year || '',

    image:
      car.image || '',

    status:
      car.status || 'available',

    current_driver_id:
      car.current_driver_id || '',

    current_driver_name:
      car.current_driver_name || '',

    current_usage_id:
      car.current_usage_id || '',

    parked_location:
      car.parked_location || '',

    notes:
      car.notes || '',

    active:
      normalizeBoolean(car.active),

    last_odometer:
      toNumberOrNull(car.last_odometer),

    last_oil_change_odometer:
      toNumberOrNull(car.last_oil_change_odometer),

    last_oil_change_date:
      normalizeIsoDate(car.last_oil_change_date),

    km_since_oil_change:
      kmSinceOilChange(car),

    // Soft, non-blocking flag: 10 000+ km since the last oil change.
    oil_change_due:
      isOilChangeDue(car),

    // Fuel-money balance for the CURRENT usage session (only meaningful while in_use).
    // Starting cash entered when the car was taken, minus the fuel expenses recorded.
    fuel_cash_start:
      toNumberOrNull(car.fuel_cash_start),

    fuel_spent_total:
      toNumberOrNull(car.fuel_spent_total) || 0,

    fuel_cash_remaining:
      (toNumberOrNull(car.fuel_cash_start) == null)
        ? null
        : (toNumberOrNull(car.fuel_cash_start) - (toNumberOrNull(car.fuel_spent_total) || 0))
  };
}


function toNumberOrNull(value) {

  if (value === '' || value == null) {
    return null;
  }

  var n = Number(value);
  return isNaN(n) ? null : n;
}


function kmSinceOilChange(car) {

  var last = toNumberOrNull(car.last_odometer);
  var oil = toNumberOrNull(car.last_oil_change_odometer);

  if (last == null || oil == null) {
    return null;
  }

  return last - oil;
}


function isOilChangeDue(car) {

  var km = kmSinceOilChange(car);
  return km != null && km >= OIL_CHANGE_INTERVAL_KM;
}


function getCars(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var rows =
    readObjects(TABS.CARS);

  var cars =
    rows

      .filter(function(car) {

        if (
          ctx.user.role === 'admin' &&
          params &&
          params.includeInactive
        ) {
          return true;
        }

        return normalizeBoolean(
          car.active
        );
      })

      .map(serializeCar);


  return ok({
    cars: cars
  });
}


function getCar(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var car =
    findCar(params.carId);

  if (!car) {
    return fail('car_not_found');
  }

  return ok({
    car: serializeCar(car)
  });
}


function saveCar(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var car =
    params.car || {};

  if (!car.registration) {
    return fail('validation');
  }

  var sheet =
    getTab(TABS.CARS);

  if (car.car_id) {

    var existing =
      findCar(car.car_id);

    if (!existing) {
      return fail('car_not_found');
    }

    sheet.getRange(
      existing.__row,
      1,
      1,
      13
    ).setValues([[
      existing.car_id,
      car.registration,
      car.make || '',
      car.model || '',
      car.year || '',
      car.image || '',
      car.status || existing.status || 'available',
      existing.current_driver_id || '',
      existing.current_driver_name || '',
      existing.current_usage_id || '',
      car.parked_location !== undefined
        ? car.parked_location
        : existing.parked_location || '',
      car.notes || '',
      car.active === false
        ? false
        : true
    ]]);


    audit(
      ctx.user,
      'car_updated',
      'car',
      car.car_id,
      car.registration
    );


    return ok({
      car_id: car.car_id
    });
  }


  var id =
    genId('CAR');


  sheet.appendRow([

    id,

    car.registration,

    car.make || '',

    car.model || '',

    car.year || '',

    car.image || '',

    car.status || 'available',

    '',

    '',

    '',

    car.parked_location || '',

    car.notes || '',

    car.active === false
      ? false
      : true
  ]);


  audit(
    ctx.user,
    'car_created',
    'car',
    id,
    car.registration
  );


  return ok({
    car_id: id
  });
}


function deleteCar(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var carId =
    params.carId ||
    (params.car && params.car.car_id);

  if (!carId) {
    return fail('validation');
  }

  var car = findCar(carId);

  if (!car) {
    return fail('car_not_found');
  }

  // A car that is currently taken must be released before it can be removed.
  if (String(car.status) === 'in_use') {
    return fail('car_in_use');
  }

  getTab(TABS.CARS).deleteRow(car.__row);

  audit(
    ctx.user,
    'car_deleted',
    'car',
    carId,
    car.registration
  );

  return ok({
    car_id: carId
  });
}


/* ============================================================================
 * TAKE / RELEASE CAR
 * ========================================================================== */

function takeCar(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var car =
    findCar(params.carId);

  if (!car) {
    return fail('car_not_found');
  }

  if (!normalizeBoolean(car.active)) {
    return fail('car_inactive');
  }

  if (
    String(car.status) !==
    'available'
  ) {
    return fail(
      'car_not_available'
    );
  }

  // A driver may hold at most 2 cars at once. Count what they already have in use.
  var mineCount = 0;
  readObjects(TABS.CARS).forEach(function(c) {
    if (
      String(c.status) === 'in_use' &&
      String(c.current_driver_id) === String(ctx.user.employee_id)
    ) {
      mineCount++;
    }
  });

  if (mineCount >= 2) {
    return fail('car_limit', { count: mineCount });
  }

  // Cash/fuel money available in the vehicle documents when taken (spec §17). Required —
  // it becomes the starting fuel-money balance for this usage session.
  var fuelCashStart = toNumberOrNull(params.fuelCashStart);
  if (fuelCashStart == null || fuelCashStart < 0) {
    return fail('fuel_cash_required');
  }

  // Safety-equipment confirmation (spec §22–§24). Missing items don't block taking the
  // car; they're recorded so the gap is visible in history and to admins.
  var equipment = params.equipment || {};

  var usageId =
    genId('USE');

  var startedAt =
    nowStamp();


  var usageSheet = getTab(TABS.USAGE);

  usageSheet
    .appendRow([

      usageId,

      car.car_id,

      car.registration,

      ctx.user.employee_id,

      ctx.user.name,

      startedAt,

      '',

      '',

      ''
    ]);

  // Record fuel-money start + safety-equipment state on the new usage row (columns added
  // on the fly so already-deployed sheets pick them up too).
  var usageRow = usageSheet.getLastRow();
  usageSheet.getRange(usageRow, ensureColumn(usageSheet, 'fuel_cash_start')).setValue(fuelCashStart);
  usageSheet.getRange(usageRow, ensureColumn(usageSheet, 'fuel_spent_total')).setValue(0);
  usageSheet.getRange(usageRow, ensureColumn(usageSheet, 'fuel_cash_remaining')).setValue(fuelCashStart);
  for (var si = 0; si < SAFETY_EQUIPMENT_FIELDS.length; si++) {
    var field = SAFETY_EQUIPMENT_FIELDS[si];
    usageSheet
      .getRange(usageRow, ensureColumn(usageSheet, field))
      .setValue(equipment[field] === true);
  }


  var carsSheet = getTab(TABS.CARS);

  carsSheet
    .getRange(
      car.__row,
      1,
      1,
      13
    )
    .setValues([[
      car.car_id,
      car.registration,
      car.make || '',
      car.model || '',
      car.year || '',
      car.image || '',
      'in_use',
      ctx.user.employee_id,
      ctx.user.name,
      usageId,
      '',
      car.notes || '',
      true
    ]]);

  // Session fuel-money balance on the car row (outside the fixed 13-wide write above).
  carsSheet.getRange(car.__row, ensureColumn(carsSheet, 'fuel_cash_start')).setValue(fuelCashStart);
  carsSheet.getRange(car.__row, ensureColumn(carsSheet, 'fuel_spent_total')).setValue(0);


  // Note any missing safety equipment in the audit trail.
  var missing = [];
  var EQUIP_LABELS = {
    has_fire_extinguisher: 'Пожарогасител',
    has_first_aid_kit: 'Аптечка',
    has_warning_triangle: 'Триъгълник',
    has_safety_vest: 'Жилетка'
  };
  for (var mi = 0; mi < SAFETY_EQUIPMENT_FIELDS.length; mi++) {
    if (equipment[SAFETY_EQUIPMENT_FIELDS[mi]] !== true) {
      missing.push(EQUIP_LABELS[SAFETY_EQUIPMENT_FIELDS[mi]]);
    }
  }

  audit(
    ctx.user,
    'car_taken',
    'car',
    car.car_id,
    car.registration +
      ' · гориво в документите: ' + fuelCashStart + ' €' +
      (missing.length ? ' · липсва: ' + missing.join(', ') : '')
  );


  return ok({

    car_id:
      car.car_id,

    usage_id:
      usageId,

    started_at:
      startedAt,

    fuel_cash_start:
      fuelCashStart
  });
}


function releaseCar(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var parkedLocation =
    String(
      params.parkedLocation || ''
    ).trim();

  if (!parkedLocation) {
    return fail('validation');
  }

  var odometer = toNumberOrNull(params.odometer);

  if (odometer == null || odometer < 0) {
    return fail('odometer_required');
  }

  var car =
    findCar(params.carId);

  if (!car) {
    return fail('car_not_found');
  }

  if (
    String(car.status) !==
    'in_use'
  ) {
    return fail('car_not_in_use');
  }

  // Odometer only moves forward.
  var prevOdometer = toNumberOrNull(car.last_odometer);
  if (prevOdometer != null && odometer < prevOdometer) {
    return fail('odometer_too_low');
  }


  var isDriver =

    String(
      car.current_driver_id
    ) ===

    String(
      ctx.user.employee_id
    );


  var isAdmin =
    ctx.user.role === 'admin';


  if (
    !isDriver &&
    !isAdmin
  ) {
    return fail('forbidden');
  }


  var endedAt =
    nowStamp();


  var usageRows =
    readObjects(TABS.USAGE);

  var usageSheet =
    getTab(TABS.USAGE);


  for (
    var i = 0;
    i < usageRows.length;
    i++
  ) {

    if (
      String(
        usageRows[i].usage_id
      ) ===
      String(
        car.current_usage_id
      )
    ) {

      usageSheet
        .getRange(
          usageRows[i].__row,
          7
        )
        .setValue(
          endedAt
        );


      usageSheet
        .getRange(
          usageRows[i].__row,
          8
        )
        .setValue(
          parkedLocation
        );


      if (params.notes) {

        usageSheet
          .getRange(
            usageRows[i].__row,
            9
          )
          .setValue(
            params.notes
          );
      }

      // Freeze the final fuel-money balance into this historical usage row.
      var startCash = toNumberOrNull(car.fuel_cash_start);
      var spent = toNumberOrNull(car.fuel_spent_total) || 0;
      if (startCash != null) {
        usageSheet.getRange(usageRows[i].__row, ensureColumn(usageSheet, 'fuel_cash_start')).setValue(startCash);
        usageSheet.getRange(usageRows[i].__row, ensureColumn(usageSheet, 'fuel_spent_total')).setValue(spent);
        usageSheet.getRange(usageRows[i].__row, ensureColumn(usageSheet, 'fuel_cash_remaining')).setValue(startCash - spent);
      }

      break;
    }
  }


  var carsSheet = getTab(TABS.CARS);

  carsSheet
    .getRange(
      car.__row,
      1,
      1,
      13
    )
    .setValues([[
      car.car_id,
      car.registration,
      car.make || '',
      car.model || '',
      car.year || '',
      car.image || '',
      'available',
      '',
      '',
      '',
      parkedLocation,
      car.notes || '',
      true
    ]]);


  // Record the odometer reading in its own column (outside the fixed 13-wide write).
  carsSheet
    .getRange(car.__row, ensureColumn(carsSheet, 'last_odometer'))
    .setValue(odometer);

  // Clear the car's live session fuel-money fields (the session is over; the balance is
  // now preserved on the usage-history row above).
  carsSheet.getRange(car.__row, ensureColumn(carsSheet, 'fuel_cash_start')).setValue('');
  carsSheet.getRange(car.__row, ensureColumn(carsSheet, 'fuel_spent_total')).setValue('');


  audit(
    ctx.user,
    'car_released',
    'car',
    car.car_id,
    parkedLocation + ' · ' + odometer + ' км'
  );


  return ok({

    car_id:
      car.car_id,

    ended_at:
      endedAt,

    parked_location:
      parkedLocation
  });
}


// Admin: record an oil change. Stores the odometer at which it was done (defaults to
// the car's last known reading) and the date (defaults to today), which clears the
// soft "oil change due" flag until another OIL_CHANGE_INTERVAL_KM is driven.
function recordOilChange(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var car = findCar(params.carId);

  if (!car) {
    return fail('car_not_found');
  }

  var odometer = toNumberOrNull(params.odometer);

  if (odometer == null) {
    odometer = toNumberOrNull(car.last_odometer);
  }

  if (odometer == null || odometer < 0) {
    return fail('odometer_required');
  }

  var date = params.date
    ? normalizeIsoDate(params.date)
    : dateOnly(new Date());

  var sheet = getTab(TABS.CARS);

  sheet
    .getRange(car.__row, ensureColumn(sheet, 'last_oil_change_odometer'))
    .setValue(odometer);

  sheet
    .getRange(car.__row, ensureColumn(sheet, 'last_oil_change_date'))
    .setValue(date);

  // Keep last_odometer consistent (never below the oil-change reading).
  var last = toNumberOrNull(car.last_odometer);
  if (last == null || last < odometer) {
    sheet
      .getRange(car.__row, ensureColumn(sheet, 'last_odometer'))
      .setValue(odometer);
  }

  audit(
    ctx.user,
    'oil_change_recorded',
    'car',
    car.car_id,
    odometer + ' км · ' + date
  );

  return ok({
    car: serializeCar(findCar(params.carId))
  });
}


/* ============================================================================
 * USAGE HISTORY
 * ========================================================================== */

function getCarUsageHistory(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var carId =
    params.carId;

  if (!carId) {
    return fail('validation');
  }

  var rows =
    readObjects(TABS.USAGE)

      .filter(function(row) {

        return (
          String(row.car_id) ===
          String(carId)
        );
      })

      .sort(function(a, b) {

        return String(
          b.start_at
        ).localeCompare(
          String(a.start_at)
        );
      });


  var limit =
    Number(params.limit || 100);


  if (
    limit > 500
  ) {
    limit = 500;
  }


  rows =
    rows.slice(0, limit);


  return ok({
    history: rows.map(function(row) {

      delete row.__row;

      return row;
    })
  });
}


/* ============================================================================
 * MAINTENANCE
 * ========================================================================== */

function getMaintenance(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var rows =
    readObjects(
      TABS.MAINTENANCE
    );


  if (
    params &&
    params.carId
  ) {

    rows =
      rows.filter(
        function(row) {

          return (
            String(row.car_id) ===
            String(params.carId)
          );
        }
      );
  }


  if (
    params &&
    params.status
  ) {

    rows =
      rows.filter(
        function(row) {

          return (
            String(row.status) ===
            String(params.status)
          );
        }
      );
  }


  rows.sort(
    function(a, b) {

      return String(
        b.reported_at
      ).localeCompare(
        String(a.reported_at)
      );
    }
  );


  return ok({
    maintenance:
      rows.map(
        function(row) {

          delete row.__row;

          return row;
        }
      )
  });
}


function reportIssue(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var issue =
    params.issue || {};

  if (
    !issue.carId ||
    !issue.title
  ) {
    return fail('validation');
  }

  var car =
    findCar(issue.carId);

  if (!car) {
    return fail('car_not_found');
  }


  var categories = [
    'engine',
    'tires',
    'brakes',
    'lights',
    'body',
    'interior',
    'electronics',
    'fluids',
    'documents',
    'other'
  ];


  var severityOptions = [
    'low',
    'medium',
    'critical'
  ];


  var category =
    categories.indexOf(
      issue.category
    ) >= 0
      ? issue.category
      : 'other';


  var severity =
    severityOptions.indexOf(
      issue.severity
    ) >= 0
      ? issue.severity
      : 'low';


  var id =
    genId('MNT');


  getTab(TABS.MAINTENANCE)
    .appendRow([

      id,

      car.car_id,

      car.registration,

      ctx.user.employee_id,

      ctx.user.name,

      nowStamp(),

      issue.title,

      issue.description || '',

      category,

      severity,

      'open',

      '',

      '',

      '',

      '',

      '',

      '',

      ''
    ]);


  /**
   * Critical issue automatically blocks vehicle,
   * unless it is currently actively being driven.
   *
   * If it is being driven, the critical warning
   * remains visible and admin can decide how to handle it.
   */
  if (
    severity === 'critical' &&
    car.status === 'available'
  ) {

    getTab(TABS.CARS)
      .getRange(
        car.__row,
        7
      )
      .setValue(
        'maintenance'
      );
  }


  audit(
    ctx.user,
    'maintenance_reported',
    'maintenance',
    id,
    car.registration
  );


  return ok({
    maintenance_id: id
  });
}


function resolveIssue(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }


  var maintenanceId =
    params.maintenanceId;


  if (!maintenanceId) {
    return fail('validation');
  }


  var rows =
    readObjects(
      TABS.MAINTENANCE
    );


  var issue =
    null;


  for (
    var i = 0;
    i < rows.length;
    i++
  ) {

    if (
      String(
        rows[i].maintenance_id
      ) ===
      String(
        maintenanceId
      )
    ) {

      issue =
        rows[i];

      break;
    }
  }


  if (!issue) {
    return fail(
      'maintenance_not_found'
    );
  }


  if (
    String(issue.status) ===
    'resolved'
  ) {
    return fail(
      'already_resolved'
    );
  }


  var sheet =
    getTab(TABS.MAINTENANCE);


  sheet.getRange(
    issue.__row,
    11,
    1,
    8
  ).setValues([[
    'resolved',

    nowStamp(),

    ctx.user.employee_id,

    ctx.user.name,

    params.repairDescription || '',

    params.service || '',

    params.cost || '',

    params.notes || ''
  ]]);


  audit(
    ctx.user,
    'maintenance_resolved',
    'maintenance',
    maintenanceId,
    ''
  );


  return ok({});
}


/* ============================================================================
 * VEHICLE DOCUMENTS
 * ========================================================================== */

function getVehicleDocuments(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }


  var rows =
    readObjects(TABS.DOCUMENTS);


  if (
    params &&
    params.carId
  ) {

    rows =
      rows.filter(
        function(row) {

          return (
            String(row.car_id) ===
            String(params.carId)
          );
        }
      );
  }


  return ok({
    documents:
      rows.map(
        function(row) {

          delete row.__row;

          return row;
        }
      )
  });
}


function saveVehicleDocument(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }


  var doc =
    params.document || {};


  if (
    !doc.carId ||
    !doc.type
  ) {
    return fail('validation');
  }


  var car =
    findCar(doc.carId);


  if (!car) {
    return fail('car_not_found');
  }


  var sheet =
    getTab(TABS.DOCUMENTS);


  var rows =
    readObjects(TABS.DOCUMENTS);


  if (
    doc.document_id
  ) {

    for (
      var i = 0;
      i < rows.length;
      i++
    ) {

      if (
        String(
          rows[i].document_id
        ) ===
        String(
          doc.document_id
        )
      ) {

        sheet.getRange(
          rows[i].__row,
          1,
          1,
          10
        ).setValues([[
          doc.document_id,
          car.car_id,
          car.registration,
          doc.type,
          doc.provider || '',
          doc.documentNumber || '',
          doc.validFrom || '',
          doc.validUntil || '',
          doc.warningDays || 30,
          doc.notes || ''
        ]]);


        audit(
          ctx.user,
          'document_updated',
          'document',
          doc.document_id,
          car.registration
        );


        return ok({
          document_id:
            doc.document_id
        });
      }
    }
  }


  var id =
    genId('DOC');


  sheet.appendRow([

    id,

    car.car_id,

    car.registration,

    doc.type,

    doc.provider || '',

    doc.documentNumber || '',

    doc.validFrom || '',

    doc.validUntil || '',

    doc.warningDays || 30,

    doc.notes || ''
  ]);


  audit(
    ctx.user,
    'document_created',
    'document',
    id,
    car.registration
  );


  return ok({
    document_id: id
  });
}


/* ============================================================================
 * AVAILABILITY
 * ========================================================================== */

function getAvailability(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }


  var rows =
    readObjects(
      TABS.AVAILABILITY
    );


  if (
    params &&
    params.weekStart
  ) {

    rows =
      rows.filter(
        function(row) {

          return (
            normalizeIsoDate(row.week_start) ===
            String(params.weekStart).trim()
          );
        }
      );
  }


  return ok({
    availability:
      rows.map(
        function(row) {

          delete row.__row;

          row.week_start =
            normalizeIsoDate(row.week_start);

          row.date =
            normalizeIsoDate(row.date);

          return row;
        }
      )
  });
}


function saveAvailability(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }


  // Pure admins review the team's requests but never submit their own shifts; admins
  // who also work shifts (worker-admins) may submit. Enforced here, not just in the UI.
  if (!canSubmitAvailability(ctx.user)) {
    return fail('admin_no_availability');
  }


  if (
    getSetting(
      'availability_open'
    ) !== 'true'
  ) {

    return fail(
      'availability_closed'
    );
  }


  var weekStart =
    params.weekStart;


  var entries =
    params.entries || [];


  if (
    !weekStart ||
    !Array.isArray(entries)
  ) {
    return fail('validation');
  }


  var allowed = [
    'none',
    'full',
    'evening'
  ];


  for (
    var i = 0;
    i < entries.length;
    i++
  ) {

    if (
      !entries[i].date ||
      allowed.indexOf(
        entries[i].shiftType
      ) < 0
    ) {
      return fail('validation');
    }
  }


  var sheet =
    getTab(
      TABS.AVAILABILITY
    );


  var rows =
    readObjects(
      TABS.AVAILABILITY
    );


  /**
   * Remove existing records for
   * THIS employee and THIS week.
   */
  var deleteRows = [];


  for (
    var r = 0;
    r < rows.length;
    r++
  ) {

    if (
      String(
        rows[r].employee_id
      ) ===
      String(
        ctx.user.employee_id
      ) &&

      normalizeIsoDate(
        rows[r].week_start
      ) ===
      String(
        weekStart
      ).trim()
    ) {

      deleteRows.push(
        rows[r].__row
      );
    }
  }


  deleteRows
    .sort(
      function(a, b) {
        return b - a;
      }
    )
    .forEach(
      function(rowNumber) {
        sheet.deleteRow(rowNumber);
      }
    );


  var updatedAt =
    nowStamp();


  // Build all new rows and write them in ONE batch (setValues) instead of an
  // appendRow per shift — far fewer Sheets round-trips for a weekly submission.
  var newRows = [];

  entries.forEach(
    function(entry) {

      if (
        entry.shiftType === 'none'
      ) {
        return;
      }

      newRows.push([
        genId('AVL'),
        ctx.user.employee_id,
        ctx.user.name,
        weekStart,
        entry.date,
        entry.shiftType,
        updatedAt
      ]);
    }
  );

  if (newRows.length) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        newRows.length,
        newRows[0].length
      )
      .setValues(newRows);
  }


  audit(
    ctx.user,
    'availability_saved',
    'availability',
    weekStart,
    ''
  );


  return ok({
    updated_at:
      updatedAt
  });
}


function setAvailabilityOpen(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }


  var open =
    params.open === true;


  setSetting(
    'availability_open',
    open
      ? 'true'
      : 'false'
  );


  audit(
    ctx.user,
    open
      ? 'availability_opened'
      : 'availability_closed',
    'settings',
    'availability_open',
    ''
  );


  return ok({
    open: open
  });
}


/**
 * Read the availability period state (any authenticated user).
 * week_start defaults to next week's Monday if not explicitly set by an admin.
 */
function getAvailabilityStatus(params, ctx) {

  var unauth =
    requireAuth(ctx);

  if (unauth) {
    return unauth;
  }

  var weekStart =
    getSetting('availability_week_start');

  if (!weekStart) {
    weekStart = nextMondayISO();
  }

  return ok({

    open:
      getSetting('availability_open') === 'true',

    week_start:
      weekStart
  });
}


/**
 * Admin: set the active availability week (Monday, ISO yyyy-MM-dd).
 */
function setAvailabilityWeek(params, ctx) {

  var notAdmin =
    requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var weekStart =
    String(params.weekStart || '').trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)
  ) {
    return fail('validation');
  }

  setSetting(
    'availability_week_start',
    weekStart
  );

  audit(
    ctx.user,
    'availability_week_set',
    'settings',
    'availability_week_start',
    weekStart
  );

  return ok({
    week_start: weekStart
  });
}


/**
 * Monday of NEXT week, in Sofia time (yyyy-MM-dd).
 */
function nextMondayISO() {

  var todayIso =
    Utilities.formatDate(
      new Date(),
      TIMEZONE,
      'yyyy-MM-dd'
    );

  var d =
    new Date(todayIso + 'T12:00:00');

  var day =
    d.getDay(); // 0=Sun..6=Sat

  var diff =
    day === 0
      ? 1
      : 8 - day;

  d.setDate(
    d.getDate() + diff
  );

  return Utilities.formatDate(
    d,
    TIMEZONE,
    'yyyy-MM-dd'
  );
}


// Diagnostic — Run this in the editor to see each active user's role and whether the
// backend will let them submit availability. Confirms the worker-admin name match
// (ПАВЕЛ, В. ПЕТКОВ) against the ACTUAL stored names.
function logAvailabilityPermissions() {
  readObjects(TABS.EMPLOYEES).forEach(function(e) {
    if (!normalizeBoolean(e.active)) return;
    Logger.log(
      (canSubmitAvailability(e) ? 'CAN submit  ' : 'CANNOT      ') +
      ' role=' + (e.role || 'employee') +
      '  name="' + e.name + '"  key="' + nameKeyBG(e.name) + '"'
    );
  });
  Logger.log('worker-admins expected keys: ' +
    AVAILABILITY_WORKER_ADMINS.map(function(n) { return nameKeyBG(n); }).join(', '));
}


/* ============================================================================
 * MIGRATION — run once on the already-deployed Fleet App Data sheet
 * ========================================================================== */

// Space-insensitive name key for matching existing rows (mirrors the frontend's
// nameKey), so "В. ПЕТКОВ" matches "В.ПЕТКОВ" regardless of spacing/case.
function nameKeyBG(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * RUN THIS ONCE after pasting the updated Backend.gs (Apps Script editor → select
 * migrateAdminsAndAuth → Run). Idempotent: safe to run more than once.
 *
 * It:
 *   1. adds the password_hash / password_configured columns if missing;
 *   2. promotes the named real users to the 'admin' role, creating ЦЕЦО / СИМО if
 *      they don't exist yet;
 *   3. deactivates and demotes the generic shared 'Администратор' account.
 *
 * EVERY user authenticates with a personal password (min 6 chars), created on first
 * login. This migration does NOT wipe passwords: a user with no configured password
 * (blank flag) is naturally taken through first-login setup; users who already set one
 * keep it until an admin resets it. Existing employee rows (and their IDs, referenced by
 * usage/maintenance/availability/audit history) are updated in place — never recreated.
 */
function migrateAdminsAndAuth() {

  var sheet = getTab(TABS.EMPLOYEES);

  // 1) Ensure the auth columns exist.
  ensureColumn(sheet, 'password_hash');
  ensureColumn(sheet, 'password_configured');

  // 2) Promote named admins; create the ones that must exist.
  var byKey = {};
  readObjects(TABS.EMPLOYEES).forEach(function(e) {
    byKey[nameKeyBG(e.name)] = e;
  });

  ADMIN_USER_NAMES.forEach(function(name) {
    var existing = byKey[nameKeyBG(name)];
    if (existing) {
      setRowCells(sheet, existing.__row, { role: 'admin', active: true });
      Logger.log('Promoted to admin: ' + name);
    }
  });

  ADMIN_MUST_EXIST.forEach(function(name) {
    if (!byKey[nameKeyBG(name)]) {
      var id = genId('EMP');
      appendRowByHeaders(sheet, {
        employee_id: id,
        name: name,
        role: 'admin',
        password_hash: '',
        password_configured: false,
        active: true
      });
      Logger.log('Created admin: ' + name + ' (' + id + ')');
    }
  });

  // 3) Retire the generic shared account (deactivate + demote — keeps its id/history
  //    intact but removes it from login and strips admin rights).
  readObjects(TABS.EMPLOYEES).forEach(function(e) {
    if (nameKeyBG(e.name) === nameKeyBG(LEGACY_ADMIN_NAME)) {
      setRowCells(sheet, e.__row, { active: false, role: 'employee' });
      Logger.log('Retired legacy account: ' + e.name);
    }
  });

  Logger.log('migrateAdminsAndAuth complete.');
}


/* ============================================================================
 * SETUP
 * ========================================================================== */

/**
 * RUN THIS ONCE MANUALLY.
 *
 * 1. Open Fleet App Data spreadsheet
 * 2. Extensions -> Apps Script
 * 3. Paste this entire Backend.gs
 * 4. Save
 * 5. Select setup
 * 6. Run
 * 7. Approve permissions
 */
function setup() {

  var active =
    SpreadsheetApp.getActiveSpreadsheet();


  if (!active) {

    throw new Error(
      'Open this Apps Script from the Fleet App Data spreadsheet before running setup().'
    );
  }


  PropertiesService
    .getScriptProperties()
    .setProperty(
      'DATASTORE_SPREADSHEET_ID',
      active.getId()
    );


  /**
   * Create PIN salt.
   */
  getPinSalt();


  /**
   * Create every application tab.
   */
  Object.keys(TABS)
    .forEach(
      function(key) {
        getTab(TABS[key]);
      }
    );


  /**
   * Default configuration.
   */
  var defaults = {

    app_name:
      'Автопарк',

    timezone:
      'Europe/Sofia',

    document_warning_days:
      '30',

    full_shift_start:
      '11:00',

    full_shift_end:
      '23:00',

    evening_shift_start:
      '17:00',

    evening_shift_end:
      '23:00',

    map_default_lat:
      '42.6977',

    map_default_lng:
      '23.3219',

    availability_open:
      'false',

    availability_week_start:
      '',

    schedule_tab_name:
      '',

    current_schedule_sheet_url:
      INITIAL_SCHEDULE_URL ===
      'https://docs.google.com/spreadsheets/d/1zIHwlR7s2m22vEvxPBz-KL3uHtJ2JKYfu0sil5pcnic/edit?pli=1&gid=1775454636#gid=1775454636'
        ? ''
        : INITIAL_SCHEDULE_URL
  };


  Object.keys(defaults)
    .forEach(
      function(key) {

        if (
          getSetting(key) === ''
        ) {

          setSetting(
            key,
            defaults[key]
          );
        }
      }
    );


  /**
   * Seed the named administrators on a brand-new install. Administration belongs to
   * real people — there is no shared "Администратор" account. Each seeded admin sets
   * their own password on first login (password_configured = false).
   */
  var employees =
    readObjects(
      TABS.EMPLOYEES
    );


  if (
    employees.length === 0
  ) {

    var empSheet = getTab(TABS.EMPLOYEES);

    ADMIN_USER_NAMES.forEach(function(name) {

      var id = genId('EMP');

      appendRowByHeaders(empSheet, {
        employee_id: id,
        name: name,
        role: 'admin',
        password_hash: '',
        password_configured: false,
        active: true
      });

      Logger.log(
        'Admin seeded: ' + name + ' (' + id + ') — password set on first login'
      );
    });
  }


  Logger.log(
    'Fleet backend setup complete.'
  );


  Logger.log(
    'Datastore Spreadsheet ID: ' +
    active.getId()
  );


  Logger.log(
    'Schedule URL: ' +
    getSetting(
      'current_schedule_sheet_url'
    )
  );
}


/**
 * One-time fleet seed. Run manually from the Apps Script editor (like setup()).
 *
 * Adds the 10 real vehicles (matched to the photos in /public/cars, keyed by
 * registration) if they are not already present. Models follow the agreed
 * make-normalisation (Citroen -> C1, Peugeot -> 107, etc.); Renaults keep their
 * real model. Safe to re-run: existing plates are skipped.
 *
 * The special "Собствена кола" is NOT seeded here — it is a built-in, app-side
 * vehicle handled entirely by the frontend (always available, no take/park,
 * no maintenance/documents, higher pay).
 */
function fleetCatalog() {

  // Authoritative make/model for the 10 photographed vehicles, keyed by plate.
  // Kept in sync with FLEET_CATALOG in src/utils/vehicles.js.
  return [
    { registration: 'CB0254CO', make: 'Citroen',    model: 'C1' },
    { registration: 'CB3989KO', make: 'Citroen',    model: 'C1' },
    { registration: 'CB8361CH', make: 'Citroen',    model: 'C1' },
    { registration: 'CB0668CC', make: 'Seat',       model: 'Ibiza' },
    { registration: 'CB1950TP', make: 'Chevrolet',  model: 'Aveo' },
    { registration: 'CB2333CP', make: 'Peugeot',    model: '107' },
    { registration: 'CB3297TA', make: 'Suzuki',     model: 'Swift' },
    { registration: 'CB0927AA', make: 'Renault',    model: 'Scenic' },
    { registration: 'CB7052CB', make: 'Renault',    model: 'Clio' },
    { registration: 'CB7920BC', make: 'Renault',    model: 'Clio' }
  ];
}


function seedFleetCars() {

  var FLEET = fleetCatalog();

  var sheet = getTab(TABS.CARS);

  var existing = {};
  readObjects(TABS.CARS).forEach(function(car) {
    existing[normalizePlate(car.registration)] = true;
  });

  var added = 0;

  FLEET.forEach(function(item) {

    if (existing[normalizePlate(item.registration)]) {
      return;
    }

    sheet.appendRow([
      genId('CAR'),
      item.registration,
      item.make,
      item.model,
      '',            // year
      '',            // image (photos are served by the frontend, keyed by plate)
      'available',
      '',            // current_driver_id
      '',            // current_driver_name
      '',            // current_usage_id
      '',            // parked_location
      '',            // notes
      true           // active
    ]);

    added++;
  });

  Logger.log('seedFleetCars: added ' + added + ' of ' + FLEET.length + ' vehicles.');
  return added;
}


/**
 * One-time cleanup: correct the make/model of the photographed vehicles whose Sheet
 * rows hold placeholder/wrong values (e.g. a plate that pre-existed with a different
 * make, so seedFleetCars skipped it). Matches by plate and only writes when a value
 * actually differs. Run manually from the Apps Script editor. Safe to re-run.
 */
function fixFleetMakes() {

  var sheet = getTab(TABS.CARS);
  var rows = readObjects(TABS.CARS);

  var wanted = {};
  fleetCatalog().forEach(function(item) {
    wanted[normalizePlate(item.registration)] = item;
  });

  var fixed = 0;

  rows.forEach(function(car) {

    var item = wanted[normalizePlate(car.registration)];
    if (!item) {
      return;
    }

    if (String(car.make) === item.make && String(car.model) === item.model) {
      return; // already correct
    }

    // Columns 3 (make) and 4 (model) in the Cars tab.
    sheet.getRange(car.__row, 3, 1, 2).setValues([[item.make, item.model]]);
    fixed++;
  });

  Logger.log('fixFleetMakes: corrected ' + fixed + ' vehicle(s).');
  return fixed;
}


/**
 * One-time cleanup of TEST fleet data. Removes ALL maintenance/repair records and all
 * insurance + annual-inspection (ГТП) documents that were seeded for testing, and
 * restores any vehicle left marked "maintenance" back to "available". Other document
 * types (винетка, данък, каско, …) and every table header are preserved.
 *
 * Run manually from the Apps Script editor before entering real data. Safe to re-run.
 */
function clearTestFleetData() {

  // 1) Wipe every Maintenance row (open issues + resolved repairs); keep the header.
  var maint = getTab(TABS.MAINTENANCE);
  var maintRows = maint.getLastRow() - 1;
  if (maintRows > 0) {
    maint.getRange(2, 1, maintRows, maint.getLastColumn()).clearContent();
  }

  // 2) Delete insurance + inspection (ГТП) documents; leave other document types.
  var docsSheet = getTab(TABS.DOCUMENTS);
  var docs = readObjects(TABS.DOCUMENTS);
  var removeTypes = { insurance: true, inspection: true };
  var docsRemoved = 0;
  // Delete bottom-up so earlier rows keep their indices as we go.
  for (var i = docs.length - 1; i >= 0; i--) {
    if (removeTypes[String(docs[i].type)]) {
      docsSheet.deleteRow(docs[i].__row);
      docsRemoved++;
    }
  }

  // 3) Any car left "maintenance" from a test critical issue → back to available, and
  //    clear its notes. status is column 7, notes column 12 in the Cars tab.
  var carsSheet = getTab(TABS.CARS);
  var carsRestored = 0;
  readObjects(TABS.CARS).forEach(function(car) {
    if (String(car.status) === 'maintenance') {
      carsSheet.getRange(car.__row, 7).setValue('available');
      carsSheet.getRange(car.__row, 12).setValue('');
      carsRestored++;
    }
  });

  var summary = {
    maintenanceCleared: maintRows > 0 ? maintRows : 0,
    documentsRemoved: docsRemoved,
    carsRestored: carsRestored
  };
  Logger.log('clearTestFleetData: ' + JSON.stringify(summary));
  return summary;
}


function normalizePlate(value) {

  // Bulgarian plates share letters between Cyrillic and Latin, so the same plate can
  // be typed either way (Cyrillic СВ… vs Latin CB…). Fold the look-alike Cyrillic
  // letters to their Latin twin so both forms compare equal.
  var MAP = {
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
    'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X'
  };

  return String(value == null ? '' : value)
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[А-Я]/g, function(ch) {
      return MAP[ch] || ch;
    });
}


/**
 * One-time cleanup: remove duplicate car rows that share a registration plate,
 * keeping the first occurrence of each. Run manually from the Apps Script editor.
 * Safe to re-run (a no-op once the fleet is clean).
 */
function dedupeFleetCars() {

  var sheet = getTab(TABS.CARS);
  var rows = readObjects(TABS.CARS);

  var seen = {};
  var toDelete = [];

  for (var i = 0; i < rows.length; i++) {

    var plate = normalizePlate(rows[i].registration);

    if (!plate) {
      continue;
    }

    if (seen[plate]) {
      toDelete.push(rows[i].__row);
    } else {
      seen[plate] = true;
    }
  }

  // Delete from the bottom up so earlier row numbers remain valid.
  toDelete.sort(function(a, b) { return b - a; });
  toDelete.forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });

  Logger.log('dedupeFleetCars: removed ' + toDelete.length + ' duplicate row(s).');
  return toDelete.length;
}


/* ============================================================================
 * MANUAL ADMIN HELPERS
 * ========================================================================== */

/**
 * Optional manual helper — directly set a user's password (e.g. to bootstrap an admin
 * without the login flow). Change values before running. Stores only the hash.
 */
function setEmployeePasswordManual() {

  var EMPLOYEE_ID =
    'EMP-CHANGE-ME';

  var NEW_PASSWORD =
    'change-me';


  var employee =
    findEmployee(
      EMPLOYEE_ID
    );


  if (!employee) {

    Logger.log(
      'Employee not found.'
    );

    return;
  }


  setRowCells(
    getTab(TABS.EMPLOYEES),
    employee.__row,
    {
      password_hash: hashPassword(NEW_PASSWORD),
      password_configured: true
    }
  );


  Logger.log(
    'Password set for ' + employee.name + '.'
  );
}


/**
 * Easy testing helper.
 *
 * Change URL below and run this function
 * if you want to change the schedule
 * without using the admin frontend.
 */
function setTestScheduleUrl() {

  var TEST_URL =
    'PASTE_YOUR_CLONED_SCHEDULE_URL_HERE';


  if (
    TEST_URL ===
    'PASTE_YOUR_CLONED_SCHEDULE_URL_HERE'
  ) {

    Logger.log(
      'Paste the cloned schedule URL first.'
    );

    return;
  }


  var id =
    extractSpreadsheetId(
      TEST_URL
    );


  if (!id) {

    Logger.log(
      'Invalid Google Sheets URL.'
    );

    return;
  }


  var sheet =
    getScheduleSheetFromUrl(
      TEST_URL
    );


  if (!sheet) {

    Logger.log(
      'Schedule tab could not be found.'
    );

    return;
  }


  setSetting(
    'current_schedule_sheet_url',
    TEST_URL
  );


  setSetting(
    'schedule_tab_name',
    ''
  );


  Logger.log(
    'Schedule configured.'
  );


  Logger.log(
    'Sheet: ' +
    sheet.getName()
  );


  Logger.log(
    'gid: ' +
    sheet.getSheetId()
  );
}


/* ============================================================================
 * ORDERS  (worker order counts + €0.50/order salary)
 * ========================================================================== */

// Empty sheet cells read back as '' — treat only explicit truthy values as true (an
// empty cell must mean false for paid/received flags; normalizeBoolean('') is true).
function strictBool(v) {
  if (v === true) return true;
  var s = String(v).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'да';
}


function serializeOrder(row) {
  return {
    order_record_id: row.order_record_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    restaurant: row.restaurant || '',
    shift_type: row.shift_type || '',
    order_count: toNumberOrNull(row.order_count) || 0,
    order_salary: toNumberOrNull(row.order_salary) || 0,
    updated_at: row.updated_at
  };
}


// Worker records/updates the number of orders for one workday (today or any past day).
// One record per employee+date; saving again updates it. Future dates are rejected.
function saveOrderCount(params, ctx) {

  var notWorker = requireWorker(ctx);
  if (notWorker) return notWorker;

  var date = normalizeIsoDate(params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('validation');
  if (date > dateOnly(new Date())) return fail('future_date');

  var count = toNumberOrNull(params.orderCount);
  if (count == null || count < 0) return fail('validation');
  count = Math.round(count);

  var restaurant = String(params.restaurant || '').trim();
  var shiftType = String(params.shiftType || '').trim();
  var weekStart = mondayOfISO(date);
  var salary = count * ORDER_RATE_EUR;
  var updatedAt = nowStamp();

  var sheet = getTab(TABS.ORDERS);
  var rows = readObjects(TABS.ORDERS);

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].employee_id) === String(ctx.user.employee_id) &&
        normalizeIsoDate(rows[i].date) === date) {
      sheet.getRange(rows[i].__row, 5).setValue(weekStart);
      sheet.getRange(rows[i].__row, 6).setValue(restaurant);
      sheet.getRange(rows[i].__row, 7).setValue(shiftType);
      sheet.getRange(rows[i].__row, 8).setValue(count);
      sheet.getRange(rows[i].__row, 9).setValue(salary);
      sheet.getRange(rows[i].__row, 10).setValue(updatedAt);
      audit(ctx.user, 'order_count_updated', 'orders', rows[i].order_record_id, date + ' · ' + count + ' поръчки');
      return ok({ order_record_id: rows[i].order_record_id, order_count: count, order_salary: salary });
    }
  }

  var id = genId('ORD');
  sheet.appendRow([id, ctx.user.employee_id, ctx.user.name, date, weekStart, restaurant, shiftType, count, salary, updatedAt]);
  audit(ctx.user, 'order_count_created', 'orders', id, date + ' · ' + count + ' поръчки');
  return ok({ order_record_id: id, order_count: count, order_salary: salary });
}


// Orders for a week. Non-admins only ever see their own; admins may pass employeeId to
// scope, or omit it for the whole team.
function getOrdersForWeek(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()));
  var isAdmin = String(ctx.user.role) === 'admin';
  var scopeEmp = params.employeeId ? String(params.employeeId) : '';
  if (!isAdmin) scopeEmp = String(ctx.user.employee_id);

  var rows = readObjects(TABS.ORDERS).filter(function(r) {
    if (normalizeIsoDate(r.week_start) !== weekStart) return false;
    if (scopeEmp && String(r.employee_id) !== scopeEmp) return false;
    return true;
  });

  return ok({ orders: rows.map(serializeOrder), week_start: weekStart });
}


/* ============================================================================
 * FUEL EXPENSES  (per-usage fuel-money balance + weekly totals)
 * ========================================================================== */

function serializeFuel(row) {
  return {
    fuel_entry_id: row.fuel_entry_id,
    car_id: row.car_id,
    registration: row.registration || '',
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    usage_id: row.usage_id || '',
    amount: toNumberOrNull(row.amount) || 0,
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    created_at: row.created_at,
    notes: row.notes || ''
  };
}


// The current driver (or an admin) records a fuel expense for the car they're driving.
// The amount is subtracted from the fuel money that was in the vehicle when it was taken.
function addFuelExpense(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var car = findCar(params.carId);
  if (!car) return fail('car_not_found');
  if (String(car.status) !== 'in_use') return fail('car_not_in_use');

  var isDriver = String(car.current_driver_id) === String(ctx.user.employee_id);
  var isAdmin = String(ctx.user.role) === 'admin';
  if (!isDriver && !isAdmin) return fail('forbidden');

  var amount = toNumberOrNull(params.amount);
  if (amount == null || amount <= 0) return fail('validation');

  var now = nowStamp();
  var date = dateOnly(new Date());
  var weekStart = mondayOfISO(date);
  var id = genId('FUEL');

  getTab(TABS.FUEL).appendRow([
    id, car.car_id, car.registration,
    ctx.user.employee_id, ctx.user.name,
    car.current_usage_id || '',
    amount, date, weekStart, now,
    String(params.notes || '').trim()
  ]);

  var carsSheet = getTab(TABS.CARS);
  var newSpent = (toNumberOrNull(car.fuel_spent_total) || 0) + amount;
  carsSheet.getRange(car.__row, ensureColumn(carsSheet, 'fuel_spent_total')).setValue(newSpent);

  var start = toNumberOrNull(car.fuel_cash_start);
  var remaining = (start == null) ? null : (start - newSpent);

  audit(ctx.user, 'fuel_expense_added', 'car', car.car_id, car.registration + ' · ' + amount + ' €');
  return ok({ fuel_entry_id: id, amount: amount, fuel_spent_total: newSpent, fuel_cash_remaining: remaining });
}


// Fuel expenses for a week. Non-admins see only their own; admins see all, optionally
// filtered to one car (for the per-vehicle weekly fuel view).
function getFuelExpensesForWeek(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()));
  var isAdmin = String(ctx.user.role) === 'admin';
  var carId = params.carId ? String(params.carId) : '';
  var scopeEmp = isAdmin ? '' : String(ctx.user.employee_id);

  var rows = readObjects(TABS.FUEL).filter(function(r) {
    if (normalizeIsoDate(r.week_start) !== weekStart) return false;
    if (carId && String(r.car_id) !== carId) return false;
    if (scopeEmp && String(r.employee_id) !== scopeEmp) return false;
    return true;
  });

  return ok({ fuel: rows.map(serializeFuel), week_start: weekStart });
}


// Fuel expenses for one usage session (the active-vehicle page lists what's been spent).
function getFuelExpensesForUsage(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var usageId = String(params.usageId || '');
  if (!usageId) return fail('validation');

  var rows = readObjects(TABS.FUEL).filter(function(r) {
    return String(r.usage_id) === usageId;
  });

  return ok({ fuel: rows.map(serializeFuel) });
}


/* ============================================================================
 * DAILY REPORTS  (detailed deliveries by payment/channel type)
 * ========================================================================== */

function serializeReportRow(row) {
  return {
    report_id: row.report_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    date: normalizeIsoDate(row.date),
    week_start: normalizeIsoDate(row.week_start),
    restaurant: row.restaurant || '',
    delivery_type: row.delivery_type || '',
    // Money value of a single delivery. Reads the new `amount` column, falling back to
    // the legacy `count` column for rows written before the value-based redesign.
    amount: toNumberOrNull(row.amount != null && row.amount !== '' ? row.amount : row.count) || 0,
    updated_at: row.updated_at
  };
}


// Worker saves their daily report as INDIVIDUAL deliveries: one row per delivery, each
// with its money value. `params.deliveries` is an array of { delivery_type, amount }.
// The save fully replaces the worker's rows for this date+restaurant (delete + re-insert),
// so adding, editing or removing a delivery on the client is reflected exactly. The count
// per category is simply how many rows a category has; the sum is the sum of their amounts.
function saveDailyReport(params, ctx) {

  var notWorker = requireWorker(ctx);
  if (notWorker) return notWorker;

  var date = normalizeIsoDate(params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('validation');
  if (date > dateOnly(new Date())) return fail('future_date');

  var restaurant = String(params.restaurant || '').trim();
  if (!restaurant) return fail('validation');

  var deliveries = params.deliveries;
  if (!Array.isArray(deliveries)) deliveries = [];

  var weekStart = mondayOfISO(date);
  var updatedAt = nowStamp();

  var sheet = getTab(TABS.REPORTS);
  var rows = readObjects(TABS.REPORTS);

  // Remove every existing row for this employee+date+restaurant (delete bottom-up so the
  // remaining row numbers stay valid), then re-insert the current set of deliveries.
  var toDelete = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].employee_id) === String(ctx.user.employee_id) &&
        normalizeIsoDate(rows[i].date) === date &&
        String(rows[i].restaurant) === restaurant) {
      toDelete.push(rows[i].__row);
    }
  }
  toDelete.sort(function(a, b) { return b - a; });
  toDelete.forEach(function(rowNumber) { sheet.deleteRow(rowNumber); });

  var saved = 0;
  for (var d = 0; d < deliveries.length; d++) {
    var type = String(deliveries[d].delivery_type || '').trim();
    if (!type) continue;
    var amount = toNumberOrNull(deliveries[d].amount);
    if (amount == null || amount < 0) amount = 0;
    amount = Math.round(amount * 100) / 100; // keep cents
    sheet.appendRow([genId('RPT'), ctx.user.employee_id, ctx.user.name, date, weekStart, restaurant, type, amount, updatedAt]);
    saved++;
  }

  audit(ctx.user, 'daily_report_saved', 'report', ctx.user.employee_id + ':' + date, restaurant + ' · ' + saved + ' доставки');
  return ok({ date: date, restaurant: restaurant, count: saved });
}


// A worker's report for a day (own only for non-admins; admins may pass employeeId).
function getDailyReport(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var date = normalizeIsoDate(params.date);
  var isAdmin = String(ctx.user.role) === 'admin';
  var scopeEmp = params.employeeId ? String(params.employeeId) : '';
  if (!isAdmin) scopeEmp = String(ctx.user.employee_id);
  var restaurant = params.restaurant ? String(params.restaurant) : '';

  var rows = readObjects(TABS.REPORTS).filter(function(r) {
    if (normalizeIsoDate(r.date) !== date) return false;
    if (scopeEmp && String(r.employee_id) !== scopeEmp) return false;
    if (restaurant && String(r.restaurant) !== restaurant) return false;
    return true;
  });

  return ok({ report: rows.map(serializeReportRow), date: date });
}


// Admin: every worker's report rows for one date (grouped restaurant→worker on the client).
function getReportsForDate(params, ctx) {

  var notAdmin = requireAdmin(ctx);
  if (notAdmin) return notAdmin;

  var date = normalizeIsoDate(params.date);
  var rows = readObjects(TABS.REPORTS).filter(function(r) {
    return normalizeIsoDate(r.date) === date;
  });

  return ok({ reports: rows.map(serializeReportRow), date: date });
}


/* ============================================================================
 * PAYROLL  (weekly pay = base + orders + fuel; payment/received tracking)
 * ========================================================================== */

// Sum Orders and FuelExpenses per employee for a week (base salary comes from the
// schedule and is supplied by the client, which parses that grid).
function aggregateWeek(weekStart) {

  var orders = {};
  readObjects(TABS.ORDERS).forEach(function(r) {
    if (normalizeIsoDate(r.week_start) !== weekStart) return;
    var id = String(r.employee_id);
    if (!orders[id]) orders[id] = { employee_id: id, employee_name: r.employee_name || '', orders_count: 0, orders_salary: 0 };
    orders[id].orders_count += toNumberOrNull(r.order_count) || 0;
    orders[id].orders_salary += toNumberOrNull(r.order_salary) || 0;
  });

  var fuel = {};
  readObjects(TABS.FUEL).forEach(function(r) {
    if (normalizeIsoDate(r.week_start) !== weekStart) return;
    var id = String(r.employee_id);
    if (!fuel[id]) fuel[id] = { employee_id: id, employee_name: r.employee_name || '', fuel_salary: 0 };
    fuel[id].fuel_salary += toNumberOrNull(r.amount) || 0;
  });

  return { orders: orders, fuel: fuel };
}


function serializePayrollRow(row) {
  return {
    payroll_id: row.payroll_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name || '',
    week_start: normalizeIsoDate(row.week_start),
    base_salary: toNumberOrNull(row.base_salary),
    orders_count: toNumberOrNull(row.orders_count),
    orders_salary: toNumberOrNull(row.orders_salary),
    fuel_salary: toNumberOrNull(row.fuel_salary),
    final_amount: toNumberOrNull(row.final_amount),
    paid: strictBool(row.paid),
    paid_at: row.paid_at || '',
    paid_by_id: row.paid_by_id || '',
    paid_by_name: row.paid_by_name || '',
    received_confirmed: strictBool(row.received_confirmed),
    received_confirmed_at: row.received_confirmed_at || '',
    updated_at: row.updated_at
  };
}


// Admin: payroll payment state for a week + server-side order/fuel aggregates. The client
// adds base salary (from the schedule) and merges by employee_id.
function getPayrollForWeek(params, ctx) {

  var notAdmin = requireAdmin(ctx);
  if (notAdmin) return notAdmin;

  var weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()));

  var payroll = readObjects(TABS.PAYROLL).filter(function(r) {
    return normalizeIsoDate(r.week_start) === weekStart;
  }).map(serializePayrollRow);

  var agg = aggregateWeek(weekStart);
  var orders = Object.keys(agg.orders).map(function(k) { return agg.orders[k]; });
  var fuel = Object.keys(agg.fuel).map(function(k) { return agg.fuel[k]; });

  return ok({ week_start: weekStart, payroll: payroll, orders: orders, fuel: fuel });
}


// A worker's own payroll record for a week (so they can see paid/received state).
function getMyPayroll(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var weekStart = mondayOfISO(params.weekStart || dateOnly(new Date()));
  var mine = null;
  readObjects(TABS.PAYROLL).forEach(function(r) {
    if (normalizeIsoDate(r.week_start) === weekStart && String(r.employee_id) === String(ctx.user.employee_id)) {
      mine = serializePayrollRow(r);
    }
  });

  return ok({ week_start: weekStart, payroll: mine });
}


// Find (or create a blank) payroll row for an employee+week. Returns its 1-based row.
function upsertPayrollRow(employeeId, employeeName, weekStart) {

  var sheet = getTab(TABS.PAYROLL);
  var rows = readObjects(TABS.PAYROLL);

  for (var i = 0; i < rows.length; i++) {
    if (normalizeIsoDate(rows[i].week_start) === weekStart && String(rows[i].employee_id) === String(employeeId)) {
      return { sheet: sheet, rowIndex: rows[i].__row };
    }
  }

  sheet.appendRow([genId('PAY'), employeeId, employeeName, weekStart, '', '', '', '', '', false, '', '', '', false, '', nowStamp()]);
  return { sheet: sheet, rowIndex: sheet.getLastRow() };
}


// Admin: mark (or unmark) a worker's weekly salary as paid, snapshotting the amounts so
// the historical record is preserved independently of later schedule/order/fuel changes.
function setPayrollPaid(params, ctx) {

  var notAdmin = requireAdmin(ctx);
  if (notAdmin) return notAdmin;

  var employeeId = String(params.employeeId || '');
  var weekStart = mondayOfISO(params.weekStart || '');
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail('validation');

  var paid = params.paid !== false;
  var loc = upsertPayrollRow(employeeId, String(params.employeeName || ''), weekStart);
  var sheet = loc.sheet;
  var row = loc.rowIndex;

  if (params.baseSalary != null) sheet.getRange(row, 5).setValue(toNumberOrNull(params.baseSalary));
  if (params.ordersCount != null) sheet.getRange(row, 6).setValue(toNumberOrNull(params.ordersCount));
  if (params.ordersSalary != null) sheet.getRange(row, 7).setValue(toNumberOrNull(params.ordersSalary));
  if (params.fuelSalary != null) sheet.getRange(row, 8).setValue(toNumberOrNull(params.fuelSalary));
  if (params.finalAmount != null) sheet.getRange(row, 9).setValue(toNumberOrNull(params.finalAmount));

  sheet.getRange(row, 10).setValue(paid);
  sheet.getRange(row, 11).setValue(paid ? nowStamp() : '');
  sheet.getRange(row, 12).setValue(paid ? ctx.user.employee_id : '');
  sheet.getRange(row, 13).setValue(paid ? ctx.user.name : '');
  if (!paid) {
    sheet.getRange(row, 14).setValue(false);
    sheet.getRange(row, 15).setValue('');
  }
  sheet.getRange(row, 16).setValue(nowStamp());

  audit(ctx.user, paid ? 'payroll_marked_paid' : 'payroll_unmarked_paid', 'payroll', employeeId, weekStart);
  return ok({ employee_id: employeeId, week_start: weekStart, paid: paid });
}


// Worker confirms they received their pay for a week (requires the admin to have marked
// it paid first). Creates a second, independent confirmation so discrepancies show.
function confirmPayrollReceived(params, ctx) {

  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var weekStart = mondayOfISO(params.weekStart || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail('validation');

  var sheet = getTab(TABS.PAYROLL);
  var rows = readObjects(TABS.PAYROLL);

  for (var i = 0; i < rows.length; i++) {
    if (normalizeIsoDate(rows[i].week_start) === weekStart &&
        String(rows[i].employee_id) === String(ctx.user.employee_id)) {
      if (!strictBool(rows[i].paid)) return fail('not_paid_yet');
      sheet.getRange(rows[i].__row, 14).setValue(true);
      sheet.getRange(rows[i].__row, 15).setValue(nowStamp());
      sheet.getRange(rows[i].__row, 16).setValue(nowStamp());
      audit(ctx.user, 'payroll_received_confirmed', 'payroll', ctx.user.employee_id, weekStart);
      return ok({ week_start: weekStart, received_confirmed: true });
    }
  }

  return fail('not_found');
}


/* ============================================================================
 * WEB API ROUTES
 * ========================================================================== */

var ROUTES = {

  /* Authentication */

  getEmployeesForLogin: {
    fn: function() {
      return getEmployeesForLogin();
    }
  },

  login: {
    fn: login,
    lock: true
  },

  logout: {
    fn: logout,
    lock: true
  },

  validateSession: {
    fn: validateSession
  },

  getCurrentUser: {
    fn: getCurrentUser
  },


  /* Employees */

  getEmployees: {
    fn: getEmployees
  },

  saveEmployee: {
    fn: saveEmployee,
    lock: true
  },

  deleteEmployee: {
    fn: deleteEmployee,
    lock: true
  },

  resetEmployeePassword: {
    fn: resetEmployeePassword,
    lock: true
  },

  // Backward-compatible alias for any client still calling the old action name.
  resetEmployeePin: {
    fn: resetEmployeePassword,
    lock: true
  },


  /* Locations */

  getLocations: {
    fn: getLocations
  },

  saveLocation: {
    fn: saveLocation,
    lock: true
  },


  /* Schedule */

  getSchedule: {
    fn: getSchedule
  },

  getScheduleRaw: {
    fn: getScheduleRaw
  },

  refreshSchedule: {
    fn: refreshSchedule
  },

  getScheduleSource: {
    fn: getScheduleSource
  },

  setScheduleSource: {
    fn: setScheduleSource,
    lock: true
  },


  /* Cars */

  getCars: {
    fn: getCars
  },

  getCar: {
    fn: getCar
  },

  saveCar: {
    fn: saveCar,
    lock: true
  },

  deleteCar: {
    fn: deleteCar,
    lock: true
  },

  takeCar: {
    fn: takeCar,
    lock: true
  },

  recordOilChange: {
    fn: recordOilChange,
    lock: true
  },

  releaseCar: {
    fn: releaseCar,
    lock: true
  },


  /* History */

  getCarUsageHistory: {
    fn: getCarUsageHistory
  },


  /* Maintenance */

  getMaintenance: {
    fn: getMaintenance
  },

  reportIssue: {
    fn: reportIssue,
    lock: true
  },

  resolveIssue: {
    fn: resolveIssue,
    lock: true
  },


  /* Documents */

  getVehicleDocuments: {
    fn: getVehicleDocuments
  },

  saveVehicleDocument: {
    fn: saveVehicleDocument,
    lock: true
  },


  /* Availability */

  getAvailability: {
    fn: getAvailability
  },

  saveAvailability: {
    fn: saveAvailability,
    lock: true
  },

  setAvailabilityOpen: {
    fn: setAvailabilityOpen,
    lock: true
  },

  getAvailabilityStatus: {
    fn: getAvailabilityStatus
  },

  setAvailabilityWeek: {
    fn: setAvailabilityWeek,
    lock: true
  },


  /* Orders */

  getOrdersForWeek: {
    fn: getOrdersForWeek
  },

  saveOrderCount: {
    fn: saveOrderCount,
    lock: true
  },


  /* Fuel expenses */

  addFuelExpense: {
    fn: addFuelExpense,
    lock: true
  },

  getFuelExpensesForWeek: {
    fn: getFuelExpensesForWeek
  },

  getFuelExpensesForUsage: {
    fn: getFuelExpensesForUsage
  },


  /* Daily reports */

  saveDailyReport: {
    fn: saveDailyReport,
    lock: true
  },

  getDailyReport: {
    fn: getDailyReport
  },

  getReportsForDate: {
    fn: getReportsForDate
  },


  /* Payroll */

  getPayrollForWeek: {
    fn: getPayrollForWeek
  },

  getMyPayroll: {
    fn: getMyPayroll
  },

  setPayrollPaid: {
    fn: setPayrollPaid,
    lock: true
  },

  confirmPayrollReceived: {
    fn: confirmPayrollReceived,
    lock: true
  }
};


/* ============================================================================
 * WEB APP ENTRY POINT
 * ========================================================================== */

function doPost(e) {

  var result;

  try {

    var body = {};


    if (
      e &&
      e.postData &&
      e.postData.contents
    ) {

      body =
        JSON.parse(
          e.postData.contents
        );
    }


    var action =
      body.action;


    var params =
      body.params || {};


    var route =
      ROUTES[action];


    if (!route) {

      result =
        fail('not_found');

    } else {

      var ctx =
        buildContext(
          body.token
        );


      if (
        route.lock
      ) {

        result =
          withLock(
            function() {

              return route.fn(
                params,
                ctx
              );
            }
          );

      } else {

        result =
          route.fn(
            params,
            ctx
          );
      }
    }

  } catch (error) {

    console.error(
      error &&
      error.stack
        ? error.stack
        : String(error)
    );


    result =
      fail(
        'server_error'
      );
  }


  return jsonResponse(
    result
  );
}


function doGet() {

  return jsonResponse(
    ok({

      service:
        'fleet-platform-backend',

      status:
        'ok',

      version:
        BACKEND_VERSION,

      timezone:
        TIMEZONE
    })
  );
}


function buildContext(token) {

  var user = null;


  try {

    user =
      resolveSession(token);

  } catch (e) {

    user = null;
  }


  return {

    user: user,

    token:
      token || null
  };
}


function jsonResponse(object) {

  return ContentService
    .createTextOutput(
      JSON.stringify(object)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
