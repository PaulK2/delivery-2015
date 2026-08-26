/**
 * Shared helpers: JSON responses, sheet access, ID generation, hashing, locking.
 */

/** Standard success payload. */
function ok(data) {
  return { ok: true, data: data || {} };
}

/** Standard error payload. `code` is a machine code the frontend maps to Bulgarian. */
function fail(code) {
  return { ok: false, error: code || 'server_error' };
}

/** Return the active spreadsheet's tab, creating it with headers if missing. */
function getTab(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = DEFAULT_HEADERS[name];
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

// Header rows used when a tab must be auto-created.
var DEFAULT_HEADERS = {
  Employees: ['employee_id', 'name', 'role', 'pin_hash', 'active'],
  Locations: ['location_id', 'name', 'address', 'latitude', 'longitude', 'active'],
  Sessions: ['token', 'employee_id', 'created_at', 'expires_at'],
  Settings: ['key', 'value'],
  Audit: ['audit_id', 'timestamp', 'employee_id', 'employee_name', 'action', 'entity_type', 'entity_id', 'details'],
};

/**
 * Read a tab into an array of plain objects keyed by the header row.
 * Empty trailing rows are skipped.
 */
function readObjects(name) {
  var sheet = getTab(name);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = row[j];
    obj.__row = i + 1; // 1-based sheet row for in-place updates
    out.push(obj);
  }
  return out;
}

/** Generate a prefixed sequential-ish unique ID, e.g. USE-a821cd (spec §59). */
function genId(prefix) {
  var rand = Utilities.getUuid().replace(/-/g, '').substring(0, 6);
  return prefix + '-' + rand;
}

/** SHA-256 hash of (salt + pin), hex. Used for PIN storage (spec §51). */
function hashPin(pin) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    PIN_SALT + String(pin),
    Utilities.Charset.UTF_8
  );
  return raw
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    })
    .join('');
}

/** Timestamp string in Sofia time. */
function nowStamp() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Run a critical write section under a document lock (spec §62).
 * Prevents double reservations and other concurrent write races.
 */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // wait up to 10s
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Append an audit record (spec §63). Best-effort; never throws to the caller. */
function audit(user, action, entityType, entityId, details) {
  try {
    getTab(TABS.AUDIT).appendRow([
      genId('AUD'),
      nowStamp(),
      user ? user.employee_id : '',
      user ? user.name : '',
      action,
      entityType || '',
      entityId || '',
      details || '',
    ]);
  } catch (e) {
    // swallow — auditing must not break the operation
  }
}
