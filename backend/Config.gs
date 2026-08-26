/**
 * Central backend configuration: sheet/tab names and Settings access.
 * All data lives in the spreadsheet bound to this Apps Script project.
 * See docs/SHEETS_SCHEMA.md for the tab column layouts.
 */

// Tab (sheet) names inside the bound spreadsheet.
var TABS = {
  EMPLOYEES: 'Employees',
  LOCATIONS: 'Locations',
  SESSIONS: 'Sessions',
  SETTINGS: 'Settings',
  AUDIT: 'Audit',
  // Phase 2+ tabs (created lazily as those features land):
  CARS: 'Cars',
  USAGE: 'UsageHistory',
  MAINTENANCE: 'Maintenance',
  DOCUMENTS: 'Documents',
  AVAILABILITY: 'Availability',
};

// Salt for PIN hashing. CHANGE THIS to a long random string in your deployment,
// then re-set every employee PIN so hashes are recomputed. Keep it secret —
// it lives only inside Apps Script, never in the frontend.
var PIN_SALT = 'CHANGE_ME_to_a_long_random_secret_string';

// Session lifetime in days.
var SESSION_TTL_DAYS = 30;

var TIMEZONE = 'Europe/Sofia';

/** Read a Settings key (spec §58). Returns '' if missing. */
function getSetting(key) {
  var sheet = getTab(TABS.SETTINGS);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) return String(values[i][1]);
  }
  return '';
}

/** Create or update a Settings key. */
function setSetting(key, value) {
  var sheet = getTab(TABS.SETTINGS);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}
