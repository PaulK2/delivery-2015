// Locations — direct port of the matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, audit } from '../lib/auth.js'
import { genId } from '../lib/util.js'

export async function getLocations(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const includeInactive = params && params.includeInactive && ctx.user.role === 'admin'
  const sql = includeInactive ? 'SELECT * FROM locations' : 'SELECT * FROM locations WHERE active = 1'
  const { results } = await db.prepare(sql).all()

  const locations = results.map((l) => ({
    location_id: l.location_id,
    name: l.name,
    address: l.address || '',
    latitude: l.latitude == null ? null : Number(l.latitude),
    longitude: l.longitude == null ? null : Number(l.longitude),
    active: !!l.active,
  }))
  return ok({ locations })
}

export async function saveLocation(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const location = params.location || {}
  if (!location.name) return fail('validation')

  const active = location.active === false ? 0 : 1
  const latitude = location.latitude != null ? location.latitude : null
  const longitude = location.longitude != null ? location.longitude : null

  if (location.location_id) {
    const existing = await db
      .prepare('SELECT location_id FROM locations WHERE location_id = ?')
      .bind(location.location_id)
      .first()
    if (!existing) return fail('not_found')

    await db
      .prepare('UPDATE locations SET name = ?, address = ?, latitude = ?, longitude = ?, active = ? WHERE location_id = ?')
      .bind(location.name, location.address || '', latitude, longitude, active, location.location_id)
      .run()
    await audit(db, ctx.user, 'location_updated', 'location', location.location_id, '')
    return ok({ location_id: location.location_id })
  }

  const id = genId('LOC')
  await db
    .prepare('INSERT INTO locations (location_id, name, address, latitude, longitude, active) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, location.name, location.address || '', latitude, longitude, active)
    .run()
  await audit(db, ctx.user, 'location_created', 'location', id, '')
  return ok({ location_id: id })
}
