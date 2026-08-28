// Fuel expenses service (Major Feature Update §15–§21, §43). The current driver records
// what they spend on fuel; it's subtracted from the cash that was in the vehicle when
// taken, and rolled up per worker (payroll) and per vehicle (admin weekly view).
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const FUEL_TTL = 30 * 1000

// Record a fuel expense for the car the user is currently driving.
export async function addFuelExpense({ carId, amount, notes }) {
  const res = await api('addFuelExpense', { carId, amount, notes })
  invalidatePrefix('fuel')
  invalidatePrefix('payroll')
  invalidatePrefix('cars') // the car's remaining fuel-money balance changed
  invalidatePrefix('car:')
  return res
}

// All fuel expenses for a week; `carId` optionally restricts to one vehicle (admin).
export async function getFuelExpensesForWeek(weekStart, { carId = '', force } = {}) {
  return cachedRequest(
    `fuel:week:${weekStart}:${carId || 'all'}`,
    FUEL_TTL,
    async () => {
      const data = await api('getFuelExpensesForWeek', { weekStart, carId })
      return data?.fuel || []
    },
    { force }
  )
}

// Fuel expenses for one usage session (the active-vehicle page).
export async function getFuelExpensesForUsage(usageId, { force } = {}) {
  if (!usageId) return []
  return cachedRequest(
    `fuel:usage:${usageId}`,
    FUEL_TTL,
    async () => {
      const data = await api('getFuelExpensesForUsage', { usageId })
      return data?.fuel || []
    },
    { force }
  )
}
