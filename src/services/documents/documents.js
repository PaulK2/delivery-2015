// Vehicle documents service (spec §46–§50). Dates are normalized to ISO to defend
// against Google Sheets' date coercion (same class of issue as availability).
import { api } from '../api/client.js'
import { toIsoDate } from '../../utils/datetime.js'
import { CONFIG } from '../../config/index.js'

function normalize(d) {
  return {
    ...d,
    valid_from: toIsoDate(d.valid_from),
    valid_until: toIsoDate(d.valid_until),
  }
}

// Documents for one vehicle.
export async function getVehicleDocuments(carId) {
  if (carId === CONFIG.ownCar.id) return [] // own car has no documents/deadlines
  const data = await api('getVehicleDocuments', { carId })
  return (data?.documents || []).map(normalize)
}

// All documents across the fleet (admin upcoming-deadlines widget, spec §71).
export async function getAllDocuments() {
  const data = await api('getVehicleDocuments', {})
  return (data?.documents || []).map(normalize)
}

// Create or update a document — admin (spec §50, §72).
export async function saveVehicleDocument(document) {
  return api('saveVehicleDocument', { document })
}
