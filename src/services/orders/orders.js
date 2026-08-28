// Orders service (Major Feature Update §1–§8, §42). Workers record how many orders they
// completed per workday; each order is worth ORDER_RATE_EUR toward weekly pay.
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const ORDERS_TTL = 30 * 1000

// Orders for a week. `employeeId` scopes to one worker (admins only; non-admins are
// always scoped to themselves server-side). Cached per week+scope.
export async function getOrdersForWeek(weekStart, { employeeId = '', force } = {}) {
  return cachedRequest(
    `orders:${weekStart}:${employeeId || 'me'}`,
    ORDERS_TTL,
    async () => {
      const data = await api('getOrdersForWeek', { weekStart, employeeId })
      return data?.orders || []
    },
    { force }
  )
}

// Save (create or update) the order count for one workday.
export async function saveOrderCount({ date, orderCount, restaurant, shiftType }) {
  const res = await api('saveOrderCount', { date, orderCount, restaurant, shiftType })
  invalidatePrefix('orders')
  invalidatePrefix('payroll')
  return res
}
