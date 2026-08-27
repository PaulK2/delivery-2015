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
  AVAILABILITY: 'Availability'
};


var DEFAULT_HEADERS = {

  Employees: [
    'employee_id',
    'name',
    'role',
    'pin_hash',
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
    'last_oil_change_date'
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
    'notes'
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


function publicUser(employee) {

  return {
    employee_id: employee.employee_id,
    name: employee.name,
    role: employee.role || 'employee'
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
        // The login screen only asks admins for a PIN (simplified staff login).
        requires_pin: String(employee.role) === 'admin'
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
        active: normalizeBoolean(employee.active)
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

    sheet.getRange(
      existing.__row,
      1,
      1,
      5
    ).setValues([[
      existing.employee_id,
      employee.name,
      role,
      existing.pin_hash,
      employee.active === false
        ? false
        : true
    ]]);

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

  var initialPin =
    String(employee.pin || '1234');

  sheet.appendRow([

    id,

    employee.name,

    role,

    hashPin(initialPin),

    employee.active === false
      ? false
      : true
  ]);

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


function resetEmployeePin(params, ctx) {

  var notAdmin = requireAdmin(ctx);

  if (notAdmin) {
    return notAdmin;
  }

  var employeeId =
    params.employeeId;

  var pin =
    String(params.pin || '');

  if (
    !employeeId ||
    pin.length < 4
  ) {
    return fail('validation');
  }

  var employee = findEmployee(employeeId);

  if (!employee) {
    return fail('employee_not_found');
  }

  getTab(TABS.EMPLOYEES)
    .getRange(employee.__row, 4)
    .setValue(hashPin(pin));

  audit(
    ctx.user,
    'employee_pin_reset',
    'employee',
    employeeId,
    ''
  );

  return ok({});
}


/* ============================================================================
 * AUTHENTICATION
 * ========================================================================== */

function login(params) {

  var employeeId =
    params.employeeId;

  var pin =
    params.pin;

  if (!employeeId) {
    return fail('validation');
  }

  var employee =
    findEmployee(employeeId);

  if (!employee) {
    return fail('invalid_pin');
  }

  if (!normalizeBoolean(employee.active)) {
    return fail('employee_inactive');
  }

  // Only administrators authenticate with a PIN; ordinary staff sign in simply by
  // selecting their name (simplified staff login).
  if (String(employee.role) === 'admin') {

    if (!pin) {
      return fail('validation');
    }

    if (
      hashPin(pin) !==
      String(employee.pin_hash)
    ) {
      return fail('invalid_pin');
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

    return ok({

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

  } catch (e) {

    console.error(e);

    return fail(
      'schedule_load_failed'
    );
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
      isOilChangeDue(car)
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

  var usageId =
    genId('USE');

  var startedAt =
    nowStamp();


  getTab(TABS.USAGE)
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


  getTab(TABS.CARS)
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


  audit(
    ctx.user,
    'car_taken',
    'car',
    car.car_id,
    car.registration
  );


  return ok({

    car_id:
      car.car_id,

    usage_id:
      usageId,

    started_at:
      startedAt
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

      break;
    }
  }


  getTab(TABS.CARS)
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
  var carsSheet = getTab(TABS.CARS);
  carsSheet
    .getRange(car.__row, ensureColumn(carsSheet, 'last_odometer'))
    .setValue(odometer);


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


  entries.forEach(
    function(entry) {

      if (
        entry.shiftType === 'none'
      ) {
        return;
      }


      sheet.appendRow([

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
   * Seed initial administrator.
   *
   * TEST LOGIN:
   *
   * Администратор
   * PIN: 1234
   */
  var employees =
    readObjects(
      TABS.EMPLOYEES
    );


  if (
    employees.length === 0
  ) {

    var id =
      genId('EMP');


    getTab(
      TABS.EMPLOYEES
    )
      .appendRow([

        id,

        'Администратор',

        'admin',

        hashPin('1234'),

        true
      ]);


    Logger.log(
      'Admin created: ' +
      id +
      ' / PIN 1234'
    );
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
 * Optional manual helper.
 *
 * Change values before running.
 */
function setEmployeePinManual() {

  var EMPLOYEE_ID =
    'EMP-CHANGE-ME';

  var NEW_PIN =
    '1234';


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


  getTab(
    TABS.EMPLOYEES
  )
    .getRange(
      employee.__row,
      4
    )
    .setValue(
      hashPin(
        NEW_PIN
      )
    );


  Logger.log(
    'PIN changed.'
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

  resetEmployeePin: {
    fn: resetEmployeePin,
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
