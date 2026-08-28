// Daily reports service (Major Feature Update §25–§39, §45). Detailed deliveries broken
// down by payment/channel type, tied to a worker + date + restaurant.
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const REPORTS_TTL = 30 * 1000

// Save (create or update) the current worker's report for a date+restaurant.
// `counts` is a map of delivery-type key -> number.
export async function saveDailyReport({ date, restaurant, counts }) {
  const res = await api('saveDailyReport', { date, restaurant, counts })
  invalidatePrefix('reports')
  return res
}

// A worker's report for a date, as flat rows [{ delivery_type, count, ... }].
// Non-admins are scoped to themselves server-side; admins may pass employeeId/restaurant.
export async function getDailyReport({ date, employeeId = '', restaurant = '', force } = {}) {
  return cachedRequest(
    `reports:day:${date}:${employeeId || 'me'}:${restaurant || 'any'}`,
    REPORTS_TTL,
    async () => {
      const data = await api('getDailyReport', { date, employeeId, restaurant })
      return data?.report || []
    },
    { force }
  )
}

// Admin: every worker's report rows for a date (grouped restaurant→worker on the client).
export async function getReportsForDate(date, { force } = {}) {
  return cachedRequest(
    `reports:date:${date}`,
    REPORTS_TTL,
    async () => {
      const data = await api('getReportsForDate', { date })
      return data?.reports || []
    },
    { force }
  )
}
