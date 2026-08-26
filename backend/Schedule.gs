/**
 * Weekly schedule (spec §11–§16, §57, §100).
 * The source is an external Google Sheet whose URL an admin configures. The backend
 * reads the raw rows and returns them; normalization happens in the frontend parser
 * layer so the sheet format can change without a backend rewrite.
 *
 * Expected source layout (spec §57, tab #1):
 *   date | day | restaurant | person | shift type | shift_payment
 * Header names are normalized to snake_case keys (e.g. "shift type" -> shift_type),
 * which the frontend parser understands (person, restaurant, shift_type, date).
 */

/** getSchedule() -> { rows: [...] } raw rows from the configured source sheet. */
function getSchedule(params, ctx) {
  var unauth = requireAuth(ctx);
  if (unauth) return unauth;
  return readScheduleRows();
}

/** refreshSchedule() — same as getSchedule; kept distinct for the UI's explicit refresh. */
function refreshSchedule(params, ctx) {
  var unauth = requireAuth(ctx);
  if (unauth) return unauth;
  return readScheduleRows();
}

/** getScheduleSource() -> { url } */
function getScheduleSource(params, ctx) {
  var unauth = requireAuth(ctx);
  if (unauth) return unauth;
  return ok({ url: getSetting('current_schedule_sheet_url') });
}

/** setScheduleSource(url) — admin only (spec §12). Validates the URL is readable. */
function setScheduleSource(params, ctx) {
  var notAdmin = requireAdmin(ctx);
  if (notAdmin) return notAdmin;

  var url = params.url || '';
  var id = extractSpreadsheetId(url);
  if (!id) return fail('validation');

  // Verify we can actually open it before saving.
  try {
    SpreadsheetApp.openById(id);
  } catch (e) {
    return fail('schedule_load_failed');
  }

  setSetting('current_schedule_sheet_url', url);
  audit(ctx.user, 'schedule_source_changed', 'settings', 'current_schedule_sheet_url', '');
  return ok({ url: url });
}

/* ---------------- internal ---------------- */

function readScheduleRows() {
  var url = getSetting('current_schedule_sheet_url');
  var id = extractSpreadsheetId(url);
  if (!id) return ok({ rows: [] }); // not configured yet — empty, not an error

  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    return fail('schedule_load_failed');
  }

  // Use a configured tab name if present, else the first sheet.
  var tabName = getSetting('schedule_tab_name');
  var sheet = tabName ? ss.getSheetByName(tabName) : ss.getSheets()[0];
  if (!sheet) return fail('schedule_load_failed');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return ok({ rows: [] });

  var headers = values[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, '_');
  });

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    if (raw.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = raw[j];
      // Dates from Sheets arrive as Date objects — emit ISO for the parser.
      if (val instanceof Date) {
        val = Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
      }
      obj[headers[j]] = val;
    }
    rows.push(obj);
  }
  return ok({ rows: rows });
}

/** Extract the spreadsheet ID from a Google Sheets URL. */
function extractSpreadsheetId(url) {
  if (!url) return null;
  var m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
