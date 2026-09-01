// Cars + take/release/oil-change + usage history — direct port of the matching
// Backend.gs sections, with the take/release race made structurally safe via a
// single conditional UPDATE (see takeCar/releaseCar) instead of a global script lock.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, audit } from '../lib/auth.js'
import { genId, nowStamp, dateOnly, normalizeIsoDate, toNumberOrNull, normalizePlate } from '../lib/util.js'

const OIL_CHANGE_INTERVAL_KM = 10000
const SAFETY_EQUIPMENT_FIELDS = [
  'has_fire_extinguisher', 'has_first_aid_kit', 'has_warning_triangle', 'has_safety_vest',
]
const EQUIP_LABELS = {
  has_fire_extinguisher: 'Пожарогасител',
  has_first_aid_kit: 'Аптечка',
  has_warning_triangle: 'Триъгълник',
  has_safety_vest: 'Жилетка',
}

function kmSinceOilChange(car) {
  const last = toNumberOrNull(car.last_odometer)
  const oil = toNumberOrNull(car.last_oil_change_odometer)
  if (last == null || oil == null) return null
  return last - oil
}

function isOilChangeDue(car) {
  const km = kmSinceOilChange(car)
  return km != null && km >= OIL_CHANGE_INTERVAL_KM
}

function serializeCar(car) {
  const start = toNumberOrNull(car.fuel_cash_start)
  const spent = toNumberOrNull(car.fuel_spent_total) || 0
  return {
    car_id: car.car_id,
    registration: car.registration,
    make: car.make || '',
    model: car.model || '',
    year: car.year || '',
    image: car.image || '',
    status: car.status || 'available',
    current_driver_id: car.current_driver_id || '',
    current_driver_name: car.current_driver_name || '',
    current_usage_id: car.current_usage_id || '',
    parked_location: car.parked_location || '',
    notes: car.notes || '',
    active: !!car.active,
    last_odometer: toNumberOrNull(car.last_odometer),
    last_oil_change_odometer: toNumberOrNull(car.last_oil_change_odometer),
    last_oil_change_date: normalizeIsoDate(car.last_oil_change_date),
    km_since_oil_change: kmSinceOilChange(car),
    oil_change_due: isOilChangeDue(car),
    fuel_cash_start: start,
    fuel_spent_total: spent,
    fuel_cash_remaining: start == null ? null : start - spent,
    needs_review: !!car.needs_review,
  }
}

async function findCar(db, carId) {
  if (!carId) return null
  return db.prepare('SELECT * FROM cars WHERE car_id = ?').bind(carId).first()
}

export async function getCars(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const includeInactive = ctx.user.role === 'admin' && params && params.includeInactive
  const sql = includeInactive ? 'SELECT * FROM cars' : 'SELECT * FROM cars WHERE active = 1'
  const { results } = await db.prepare(sql).all()
  return ok({ cars: results.map(serializeCar) })
}

export async function getCar(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const car = await findCar(ctx.env.DB, params.carId)
  if (!car) return fail('car_not_found')
  return ok({ car: serializeCar(car) })
}

export async function saveCar(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const car = params.car || {}
  if (!car.registration) return fail('validation')

  if (car.car_id) {
    const existing = await findCar(db, car.car_id)
    if (!existing) return fail('car_not_found')

    await db
      .prepare(
        `UPDATE cars SET registration = ?, make = ?, model = ?, year = ?, image = ?, status = ?,
         parked_location = ?, notes = ?, active = ?, needs_review = 0 WHERE car_id = ?`
      )
      .bind(
        car.registration,
        car.make || '',
        car.model || '',
        car.year || '',
        car.image || '',
        car.status || existing.status || 'available',
        car.parked_location !== undefined ? car.parked_location : existing.parked_location || '',
        car.notes || '',
        car.active === false ? 0 : 1,
        car.car_id
      )
      .run()
    await audit(db, ctx.user, 'car_updated', 'car', car.car_id, car.registration)
    return ok({ car_id: car.car_id })
  }

  const id = genId('CAR')
  await db
    .prepare(
      `INSERT INTO cars (car_id, registration, make, model, year, image, status,
       current_driver_id, current_driver_name, current_usage_id, parked_location, notes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?)`
    )
    .bind(
      id,
      car.registration,
      car.make || '',
      car.model || '',
      car.year || '',
      car.image || '',
      car.status || 'available',
      car.parked_location || '',
      car.notes || '',
      car.active === false ? 0 : 1
    )
    .run()
  await audit(db, ctx.user, 'car_created', 'car', id, car.registration)
  return ok({ car_id: id })
}

export async function deleteCar(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const carId = params.carId || (params.car && params.car.car_id)
  if (!carId) return fail('validation')

  const car = await findCar(db, carId)
  if (!car) return fail('car_not_found')

  // A car that is currently taken must be released before it can be removed.
  if (String(car.status) === 'in_use') return fail('car_in_use')

  await db.prepare('DELETE FROM cars WHERE car_id = ?').bind(carId).run()
  await audit(db, ctx.user, 'car_deleted', 'car', carId, car.registration)
  return ok({ car_id: carId })
}

// Take a vehicle. The claim itself is a single conditional UPDATE (status must still be
// 'available') — this makes double-booking the same car structurally impossible, no
// global lock needed (an improvement over the old LockService-serialized version).
export async function takeCar(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const car = await findCar(db, params.carId)
  if (!car) return fail('car_not_found')
  if (!car.active) return fail('car_inactive')

  // A driver may hold at most 2 cars at once.
  const mine = await db
    .prepare("SELECT COUNT(*) AS n FROM cars WHERE status = 'in_use' AND current_driver_id = ?")
    .bind(ctx.user.employee_id)
    .first()
  if ((mine?.n || 0) >= 2) return fail('car_limit', { count: mine.n })

  // Cash/fuel money available in the vehicle documents when taken — required, becomes
  // the starting fuel-money balance for this usage session.
  const fuelCashStart = toNumberOrNull(params.fuelCashStart)
  if (fuelCashStart == null || fuelCashStart < 0) return fail('fuel_cash_required')

  const equipment = params.equipment || {}
  const usageId = genId('USE')
  const startedAt = nowStamp()

  const claim = await db
    .prepare(
      `UPDATE cars SET status = 'in_use', current_driver_id = ?, current_driver_name = ?,
       current_usage_id = ?, fuel_cash_start = ?, fuel_spent_total = 0
       WHERE car_id = ? AND status = 'available' AND active = 1`
    )
    .bind(ctx.user.employee_id, ctx.user.name, usageId, fuelCashStart, car.car_id)
    .run()
  if (!claim.meta.changes) return fail('car_not_available')

  await db
    .prepare(
      `INSERT INTO usage_history (usage_id, car_id, registration, employee_id, employee_name,
       start_at, fuel_cash_start, fuel_spent_total, fuel_cash_remaining,
       has_fire_extinguisher, has_first_aid_kit, has_warning_triangle, has_safety_vest)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    )
    .bind(
      usageId, car.car_id, car.registration, ctx.user.employee_id, ctx.user.name, startedAt,
      fuelCashStart, fuelCashStart,
      equipment.has_fire_extinguisher === true ? 1 : 0,
      equipment.has_first_aid_kit === true ? 1 : 0,
      equipment.has_warning_triangle === true ? 1 : 0,
      equipment.has_safety_vest === true ? 1 : 0
    )
    .run()

  const missing = SAFETY_EQUIPMENT_FIELDS.filter((f) => equipment[f] !== true).map((f) => EQUIP_LABELS[f])
  await audit(
    db, ctx.user, 'car_taken', 'car', car.car_id,
    car.registration + ' · гориво в документите: ' + fuelCashStart + ' €' +
      (missing.length ? ' · липсва: ' + missing.join(', ') : '')
  )

  return ok({ car_id: car.car_id, usage_id: usageId, started_at: startedAt, fuel_cash_start: fuelCashStart })
}

export async function releaseCar(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const parkedLocation = String(params.parkedLocation || '').trim()
  if (!parkedLocation) return fail('validation')

  const odometer = toNumberOrNull(params.odometer)
  if (odometer == null || odometer < 0) return fail('odometer_required')

  const car = await findCar(db, params.carId)
  if (!car) return fail('car_not_found')
  if (String(car.status) !== 'in_use') return fail('car_not_in_use')

  const prevOdometer = toNumberOrNull(car.last_odometer)
  if (prevOdometer != null && odometer < prevOdometer) return fail('odometer_too_low')

  const isDriver = String(car.current_driver_id) === String(ctx.user.employee_id)
  const isAdmin = ctx.user.role === 'admin'
  if (!isDriver && !isAdmin) return fail('forbidden')

  const endedAt = nowStamp()
  const startCash = toNumberOrNull(car.fuel_cash_start)
  const spent = toNumberOrNull(car.fuel_spent_total) || 0

  const claim = await db
    .prepare(
      `UPDATE cars SET status = 'available', current_driver_id = '', current_driver_name = '',
       current_usage_id = '', parked_location = ?, last_odometer = ?, fuel_cash_start = NULL,
       fuel_spent_total = NULL WHERE car_id = ? AND status = 'in_use'`
    )
    .bind(parkedLocation, odometer, car.car_id)
    .run()
  if (!claim.meta.changes) return fail('car_not_in_use')

  await db
    .prepare(
      `UPDATE usage_history SET end_at = ?, parked_location = ?, notes = COALESCE(?, notes),
       fuel_cash_start = ?, fuel_spent_total = ?, fuel_cash_remaining = ?
       WHERE usage_id = ?`
    )
    .bind(
      endedAt, parkedLocation, params.notes || null,
      startCash, spent, startCash == null ? null : startCash - spent,
      car.current_usage_id
    )
    .run()

  await audit(db, ctx.user, 'car_released', 'car', car.car_id, parkedLocation + ' · ' + odometer + ' км')
  return ok({ car_id: car.car_id, ended_at: endedAt, parked_location: parkedLocation })
}

// Admin: record an oil change. Stores the odometer at which it was done (defaults to
// the car's last known reading) and the date (defaults to today), which clears the
// soft "oil change due" flag until another OIL_CHANGE_INTERVAL_KM is driven.
export async function recordOilChange(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const car = await findCar(db, params.carId)
  if (!car) return fail('car_not_found')

  let odometer = toNumberOrNull(params.odometer)
  if (odometer == null) odometer = toNumberOrNull(car.last_odometer)
  if (odometer == null || odometer < 0) return fail('odometer_required')

  const date = params.date ? normalizeIsoDate(params.date) : dateOnly(new Date())
  const last = toNumberOrNull(car.last_odometer)
  const nextLastOdometer = last == null || last < odometer ? odometer : last

  await db
    .prepare(
      'UPDATE cars SET last_oil_change_odometer = ?, last_oil_change_date = ?, last_odometer = ? WHERE car_id = ?'
    )
    .bind(odometer, date, nextLastOdometer, car.car_id)
    .run()

  await audit(db, ctx.user, 'oil_change_recorded', 'car', car.car_id, odometer + ' км · ' + date)
  return ok({ car: serializeCar(await findCar(db, params.carId)) })
}

export async function getCarUsageHistory(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth
  if (!params.carId) return fail('validation')

  let limit = Number(params.limit || 100)
  if (limit > 500) limit = 500

  const { results } = await ctx.env.DB
    .prepare('SELECT * FROM usage_history WHERE car_id = ? ORDER BY start_at DESC LIMIT ?')
    .bind(params.carId, limit)
    .all()

  const history = results.map((row) => ({
    ...row,
    has_fire_extinguisher: !!row.has_fire_extinguisher,
    has_first_aid_kit: !!row.has_first_aid_kit,
    has_warning_triangle: !!row.has_warning_triangle,
    has_safety_vest: !!row.has_safety_vest,
  }))
  return ok({ history })
}

// One-time initial-activation helper (admin-triggered, not automatic/recurring): the
// client resolves today's schedule car notes to {employeeId, employeeName, plate}
// (reusing the same fuzzy plate matching the График page already uses) and this takes
// each car exactly as if the employee had formally taken it — no fuel-cash amount is
// known for a backfill, so fuel_cash_start stays null; a usage_history row is still
// created so the normal release flow works afterward. A plate with no matching car
// creates one (active, needs_review — an admin fills in make/model/photo later). Cars
// already in_use for someone ELSE are left alone and reported, never overwritten.
export async function bootstrapCarAssignments(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const assignments = Array.isArray(params.assignments) ? params.assignments : []
  if (!assignments.length) return fail('validation')

  const assigned = []
  const created = []
  const skipped = []

  for (const a of assignments) {
    const plate = normalizePlate(a.plate)
    const employeeId = String(a.employeeId || '')
    const employeeName = String(a.employeeName || '')
    if (!plate || !employeeId) {
      skipped.push({ plate: a.plate || '', employeeName, reason: 'invalid' })
      continue
    }

    let car = await db.prepare('SELECT * FROM cars WHERE registration = ?').bind(plate).first()
    let wasCreated = false

    if (!car) {
      const id = genId('CAR')
      await db
        .prepare(
          `INSERT INTO cars (car_id, registration, make, model, year, image, status,
           current_driver_id, current_driver_name, current_usage_id, parked_location, notes, active, needs_review)
           VALUES (?, ?, '', '', '', '', 'available', '', '', '', '', '', 1, 1)`
        )
        .bind(id, plate)
        .run()
      car = await db.prepare('SELECT * FROM cars WHERE car_id = ?').bind(id).first()
      wasCreated = true
      await audit(db, ctx.user, 'car_created', 'car', id, plate + ' · автоматично добавена от графика, нуждае се от преглед')
    }

    if (String(car.status) === 'in_use') {
      if (String(car.current_driver_id) === employeeId) {
        skipped.push({ plate, employeeName, reason: 'already_assigned' })
      } else {
        skipped.push({ plate, employeeName, reason: 'taken_by_other', currentDriver: car.current_driver_name })
      }
      continue
    }

    const usageId = genId('USE')
    const startedAt = nowStamp()
    const claim = await db
      .prepare(
        `UPDATE cars SET status = 'in_use', current_driver_id = ?, current_driver_name = ?, current_usage_id = ?
         WHERE car_id = ? AND status = 'available'`
      )
      .bind(employeeId, employeeName, usageId, car.car_id)
      .run()
    if (!claim.meta.changes) {
      skipped.push({ plate, employeeName, reason: 'race' })
      continue
    }

    await db
      .prepare(
        `INSERT INTO usage_history (usage_id, car_id, registration, employee_id, employee_name, start_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(usageId, car.car_id, car.registration, employeeId, employeeName, startedAt, 'Присвоено по график при първоначално активиране на приложението')
      .run()

    await audit(db, ctx.user, 'car_taken', 'car', car.car_id, car.registration + ' · присвоено на ' + employeeName + ' по график (първоначално активиране)')

    ;(wasCreated ? created : assigned).push({ car_id: car.car_id, plate, employeeName })
  }

  return ok({ assigned, created, skipped })
}
