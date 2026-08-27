// Fleet service. Wraps the backend vehicle actions (spec §24–§36, §98, §99).
import { api } from '../api/client.js'

// Lightweight list for the vehicles page (spec §82 — summary data only).
export async function getCars() {
  const data = await api('getCars', {})
  return data?.cars || []
}

export async function getCar(carId) {
  const data = await api('getCar', { carId })
  return data?.car || null
}

// Admin list including inactive vehicles (spec §72).
export async function getAllCars() {
  const data = await api('getCars', { includeInactive: true })
  return data?.cars || []
}

// Admin: create or update a vehicle (spec §72).
export async function saveCar(car) {
  return api('saveCar', { car })
}

// Take a vehicle. Backend re-checks availability under a lock and prevents
// double reservation (spec §30, §31).
export async function takeCar(carId) {
  return api('takeCar', { carId })
}

// Release a vehicle; parking location is required (spec §32, §33).
export async function releaseCar(carId, parkedLocation, notes) {
  return api('releaseCar', { carId, parkedLocation, notes })
}

// Usage history, lazy-loaded when the user opens a vehicle (spec §34, §82).
export async function getCarUsageHistory(carId, limit) {
  const data = await api('getCarUsageHistory', { carId, limit })
  return data?.history || []
}

// Active/all maintenance for a vehicle.
export async function getCarMaintenance(carId, status) {
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
