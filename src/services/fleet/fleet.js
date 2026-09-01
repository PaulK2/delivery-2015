// Fleet service. Wraps the backend vehicle actions (spec §24–§36, §98, §99).
import { api } from '../api/client.js'
import { cachedRequest, invalidate, invalidatePrefix } from '../api/cache.js'
import { CONFIG } from '../../config/index.js'
import { makeOwnCar, normalizePlate } from '../../utils/vehicles.js'

const OWN_ID = CONFIG.ownCar.id
const CARS_TTL = 20 * 1000 // operational — short cache
const HISTORY_TTL = 10 * 60 * 1000 // stable until the car changes (invalidated on writes)

// A car changed → drop everything derived from it so the next read is fresh.
function invalidateFleet(carId) {
  invalidatePrefix('cars')
  if (carId) {
    invalidate('car:' + carId)
    invalidatePrefix('usage:' + carId)
    invalidatePrefix('maint:' + carId)
  }
  invalidatePrefix('maint') // fleet-wide maintenance summaries may shift too
}

// Collapse duplicate rows that share a registration plate, keeping the first seen.
// Guards against duplicate entries in the backing sheet (e.g. a re-run seed).
function dedupeByPlate(cars) {
  const seen = new Set()
  const out = []
  for (const car of cars) {
    const plate = normalizePlate(car.registration)
    if (plate && seen.has(plate)) continue
    if (plate) seen.add(plate)
    out.push(car)
  }
  return out
}

// Lightweight list for the vehicles page (spec §82 — summary data only). The
// built-in "own car" is appended client-side (it has no Sheet row) and is always
// shown as available.
export async function getCars({ force } = {}) {
  return cachedRequest(
    'cars',
    CARS_TTL,
    async () => {
      const data = await api('getCars', {})
      return [...dedupeByPlate(data?.cars || []), makeOwnCar()]
    },
    { force }
  )
}

export async function getCar(carId, { force } = {}) {
  if (carId === OWN_ID) return makeOwnCar()
  return cachedRequest(
    'car:' + carId,
    CARS_TTL,
    async () => {
      const data = await api('getCar', { carId })
      return data?.car || null
    },
    { force }
  )
}

// Admin list including inactive vehicles (spec §72). De-duplicated by plate so
// duplicate sheet rows collapse to a single entry.
export async function getAllCars({ force } = {}) {
  return cachedRequest(
    'cars:all',
    CARS_TTL,
    async () => {
      const data = await api('getCars', { includeInactive: true })
      return dedupeByPlate(data?.cars || [])
    },
    { force }
  )
}

// Admin: create or update a vehicle (spec §72).
export async function saveCar(car) {
  const res = await api('saveCar', { car })
  invalidateFleet(car?.car_id)
  return res
}

// Admin: permanently delete a vehicle.
export async function deleteCar(carId) {
  const res = await api('deleteCar', { carId })
  invalidateFleet(carId)
  return res
}

// One-time initial-activation helper (admin-triggered, not automatic): takes each
// {employeeId, employeeName, plate} pair exactly as if that employee had formally
// taken the car (no fuel-cash amount is known for a backfill). A plate with no
// matching car creates one, flagged needs_review for an admin to complete later.
export async function bootstrapCarAssignments(assignments) {
  const res = await api('bootstrapCarAssignments', { assignments })
  invalidateFleet()
  return res
}

// Take a vehicle. Backend re-checks availability under a lock and prevents double
// reservation (spec §30, §31). `fuelCashStart` (cash for fuel in the vehicle documents)
// is required; `equipment` records the safety-equipment check (§17, §22).
export async function takeCar(carId, { fuelCashStart, equipment } = {}) {
  const res = await api('takeCar', { carId, fuelCashStart, equipment })
  invalidateFleet(carId)
  return res
}

// Release a vehicle; parking location + current odometer are required (spec §32, §33).
export async function releaseCar(carId, parkedLocation, notes, odometer) {
  const res = await api('releaseCar', { carId, parkedLocation, notes, odometer })
  invalidateFleet(carId)
  return res
}

// Admin: record an oil change (odometer + date), clearing the "oil change due" flag.
export async function recordOilChange(carId, odometer, date) {
  const res = await api('recordOilChange', { carId, odometer, date })
  invalidateFleet(carId)
  return res
}

// Usage history, lazy-loaded when the user opens a vehicle (spec §34, §82). Cached per
// car+limit until that car changes.
export async function getCarUsageHistory(carId, limit, { force } = {}) {
  if (carId === OWN_ID) return [] // own car isn't taken/parked — no usage history
  return cachedRequest(
    'usage:' + carId + ':' + (limit || 'all'),
    HISTORY_TTL,
    async () => {
      const data = await api('getCarUsageHistory', { carId, limit })
      return data?.history || []
    },
    { force }
  )
}

// Active/all maintenance for a vehicle.
export async function getCarMaintenance(carId, status, { force } = {}) {
  if (carId === OWN_ID) return [] // own car has no maintenance
  return cachedRequest(
    'maint:' + carId + ':' + (status || 'all'),
    30 * 1000,
    async () => {
      const data = await api('getMaintenance', { carId, status })
      return data?.maintenance || []
    },
    { force }
  )
}

// Admin: restore a vehicle to service after maintenance (spec §40, §72). The backend
// has no dedicated setCarStatus, so saveCar carries the status change while preserving
// the other fields server-side.
export async function restoreCarToService(car) {
  const res = await api('saveCar', {
    car: { car_id: car.car_id, registration: car.registration, status: 'available' },
  })
  invalidateFleet(car?.car_id)
  return res
}
