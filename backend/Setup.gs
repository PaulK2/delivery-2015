/**
 * One-time setup helpers. Run these manually from the Apps Script editor
 * (select the function, click Run) — they are NOT exposed as web actions.
 */

/**
 * Creates all required tabs with headers, seeds default Settings, and a first
 * admin employee. Safe to run more than once (won't duplicate existing rows).
 */
function setup() {
  // Ensure core tabs exist with headers.
  [TABS.EMPLOYEES, TABS.LOCATIONS, TABS.SESSIONS, TABS.SETTINGS, TABS.AUDIT].forEach(function (t) {
    getTab(t);
  });

  // Seed default settings if missing (spec §58).
  var defaults = {
    app_name: 'Автопарк',
    document_warning_days: '30',
    timezone: 'Europe/Sofia',
    full_shift_start: '11:00',
    full_shift_end: '23:00',
    evening_shift_start: '17:00',
    evening_shift_end: '23:00',
    map_default_lat: '42.6977',
    map_default_lng: '23.3219',
    availability_open: 'false',
    current_schedule_sheet_url: '',
    schedule_tab_name: '',
  };
  Object.keys(defaults).forEach(function (k) {
    if (getSetting(k) === '') setSetting(k, defaults[k]);
  });

  // Seed a first admin if the Employees tab has no data rows.
  var employees = readObjects(TABS.EMPLOYEES);
  if (employees.length === 0) {
    var id = genId('EMP');
    getTab(TABS.EMPLOYEES).appendRow([id, 'Администратор', 'admin', hashPin('1234'), true]);
    Logger.log('Seeded admin employee %s with PIN 1234 — CHANGE IT with setPin().', id);
  }
  Logger.log('Setup complete.');
}

/**
 * Set (or reset) an employee PIN. PINs are never stored in plaintext — this writes
 * the salted hash. Usage: edit the two constants below, then Run this function.
 */
function setPin() {
  var EMPLOYEE_ID = 'EMP-xxxxxx'; // <-- put the employee_id here
  var NEW_PIN = '1234'; // <-- put the new 4–6 digit PIN here

  var sheet = getTab(TABS.EMPLOYEES);
  var list = readObjects(TABS.EMPLOYEES);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].employee_id) === String(EMPLOYEE_ID)) {
      sheet.getRange(list[i].__row, 4).setValue(hashPin(NEW_PIN)); // column 4 = pin_hash
      Logger.log('PIN updated for %s', EMPLOYEE_ID);
      return;
    }
  }
  Logger.log('Employee %s not found.', EMPLOYEE_ID);
}

/**
 * Add a new employee. Edit the constants, then Run.
 */
function addEmployee() {
  var NAME = 'Иван Петров';
  var ROLE = 'employee'; // 'employee' or 'admin'
  var PIN = '1234';

  var id = genId('EMP');
  getTab(TABS.EMPLOYEES).appendRow([id, NAME, ROLE, hashPin(PIN), true]);
  Logger.log('Added employee %s (%s)', NAME, id);
}
