// Fleet service. Wraps the backend vehicle actions (spec §24–§36, §98, §99).
import { api } from '../api/client.js'
import { CONFIG } from '../../config/index.js'
import { makeOwnCar, normalizePlate } from '../../utils/vehicles.js'

const OWN_ID = CONFIG.ownCar.id

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
export async function getCars() {
  const data = await api('getCars', {})
  return [...dedupeByPlate(data?.cars || []), makeOwnCar()]
}

export async function getCar(carId) {
  if (carId === OWN_ID) return makeOwnCar()
  const data = await api('getCar', { carId })
  return data?.car || null
}

// Admin list including inactive vehicles (spec §72). De-duplicated by plate so
// duplicate sheet rows collapse to a single entry.
export async function getAllCars() {
  const data = await api('getCars', { includeInactive: true })
  return dedupeByPlate(data?.cars || [])
}

// Admin: create or update a vehicle (spec §72).
export async function saveCar(car) {
  return api('saveCar', { car })
}

// Admin: permanently delete a vehicle.
export async function deleteCar(carId) {
  return api('deleteCar', { carId })
}

// Take a vehicle. Backend re-checks availability under a lock and prevents
// double reservation (spec §30, §31).
export async function takeCar(carId) {
  return api('takeCar', { carId })
}

// Release a vehicle; parking location + current odometer are required (spec §32, §33).
export async function releaseCar(carId, parkedLocation, notes, odometer) {
  return api('releaseCar', { carId, parkedLocation, notes, odometer })
}

// Admin: record an oil change (odometer + date), clearing the "oil change due" flag.
export async function recordOilChange(carId, odometer, date) {
  return api('recordOilChange', { carId, odometer, date })
}

// Usage history, lazy-loaded when the user opens a vehicle (spec §34, §82).
export async function getCarUsageHistory(carId, limit) {
  if (carId === OWN_ID) return [] // own car isn't taken/parked — no usage history
  const data = await api('getCarUsageHistory', { carId, limit })
  return data?.history || []
}

// Active/all maintenance for a vehicle.
export async function getCarMaintenance(carId, status) {
  if (carId === OWN_ID) return [] // own car has no maintenance
  const data = await api('getMaintenance', { carId, status })
  return data?.maintenance || []
}

// Admin: restore a vehicle to service after maintenance (spec §40, §72). The backend
// has no dedicated setCarStatus, so saveCar carries the status change while preserving
// the other fields server-side.
export async function restoreCarToService(car) {
  return api('saveCar', {
    car: { car_id: car.car_id, registration: car.registration, status: 'available' },
  })
}
