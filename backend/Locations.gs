/**
 * Work locations (spec §56, §74). Frontend uses latitude/longitude for map markers.
 */

/** getLocations() -> { locations: [...] } — active locations only for normal use. */
function getLocations(params, ctx) {
  var unauth = requireAuth(ctx);
  if (unauth) return unauth;

  var includeInactive = params && params.includeInactive && (ctx.user.role === 'admin');
  var list = readObjects(TABS.LOCATIONS)
    .filter(function (l) {
      if (includeInactive) return true;
      return String(l.active).toLowerCase() !== 'false' && l.active !== false;
    })
    .map(function (l) {
      return {
        location_id: l.location_id,
        name: l.name,
        address: l.address || '',
        latitude: l.latitude === '' ? null : Number(l.latitude),
        longitude: l.longitude === '' ? null : Number(l.longitude),
        active: !(String(l.active).toLowerCase() === 'false' || l.active === false),
      };
    });
  return ok({ locations: list });
}

/** saveLocation(location) — admin only (spec §74). Creates or updates by location_id. */
function saveLocation(params, ctx) {
  var notAdmin = requireAdmin(ctx);
  if (notAdmin) return notAdmin;

  var loc = params.location || {};
  if (!loc.name) return fail('validation');

  var sheet = getTab(TABS.LOCATIONS);
  var existing = readObjects(TABS.LOCATIONS);

  if (loc.location_id) {
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i].location_id) === String(loc.location_id)) {
        var r = existing[i].__row;
        sheet.getRange(r, 1, 1, 6).setValues([[
          loc.location_id,
          loc.name,
          loc.address || '',
          loc.latitude != null ? loc.latitude : '',
          loc.longitude != null ? loc.longitude : '',
          loc.active === false ? false : true,
        ]]);
        audit(ctx.user, 'location_updated', 'location', loc.location_id, '');
        return ok({ location_id: loc.location_id });
      }
    }
  }

  var newId = genId('LOC');
  sheet.appendRow([
    newId,
    loc.name,
    loc.address || '',
    loc.latitude != null ? loc.latitude : '',
    loc.longitude != null ? loc.longitude : '',
    loc.active === false ? false : true,
  ]);
  audit(ctx.user, 'location_created', 'location', newId, '');
  return ok({ location_id: newId });
}
