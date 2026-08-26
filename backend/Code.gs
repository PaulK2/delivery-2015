/**
 * Web App entry point and action router (spec §60).
 * Single endpoint: the frontend POSTs { action, token, params } as text/plain.
 * Each action maps to a handler(params, ctx) where ctx = { user, token }.
 *
 * Deploy: Deploy > New deployment > Web app, "Execute as: Me",
 * "Who has access: Anyone". Copy the /exec URL into the frontend (docs/SETUP.md).
 */

// action -> { fn, lock } ; lock:true wraps the handler in a script lock (spec §62).
var ROUTES = {
  // Auth
  login: { fn: login, lock: true },
  logout: { fn: logout },
  validateSession: { fn: validateSession },
  getCurrentUser: { fn: getCurrentUser },
  getEmployeesForLogin: { fn: function () { return getEmployeesForLogin(); } },

  // Schedule
  getSchedule: { fn: getSchedule },
  refreshSchedule: { fn: refreshSchedule },
  getScheduleSource: { fn: getScheduleSource },
  setScheduleSource: { fn: setScheduleSource, lock: true },

  // Locations
  getLocations: { fn: getLocations },
  saveLocation: { fn: saveLocation, lock: true },
};

function doPost(e) {
  var result;
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action;
    var params = body.params || {};
    var route = ROUTES[action];

    if (!route) {
      result = fail('not_found');
    } else {
      var ctx = buildContext(body.token);
      if (route.lock) {
        result = withLock(function () { return route.fn(params, ctx); });
      } else {
        result = route.fn(params, ctx);
      }
    }
  } catch (err) {
    // Never leak raw errors to the client (spec §16, §78).
    result = fail('server_error');
    logError(err);
  }
  return jsonResponse(result);
}

function doGet() {
  // Health check / friendly response for anyone opening the URL directly.
  return jsonResponse(ok({ service: 'fleetview-backend', status: 'ok' }));
}

function buildContext(token) {
  var user = null;
  try {
    user = resolveSession(token);
  } catch (e) {
    user = null;
  }
  return { user: user, token: token || null };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function logError(err) {
  try {
    console.error(err && err.stack ? err.stack : String(err));
  } catch (e) {
    // ignore
  }
}
