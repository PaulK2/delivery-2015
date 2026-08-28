// Payroll service (Major Feature Update §9–§14, §46, §47). Weekly pay = base salary
// (from the schedule) + orders salary + fuel reimbursement. This module handles the
// payment STATE (paid / received) and the server-side order/fuel aggregates; base salary
// is computed on the client from the parsed schedule and passed in when marking paid.
import { api } from '../api/client.js'
import { cachedRequest, invalidatePrefix } from '../api/cache.js'

const PAYROLL_TTL = 30 * 1000

// Admin: payment state rows + order/fuel aggregates for a week.
// Returns { week_start, payroll:[], orders:[], fuel:[] }.
export async function getPayrollForWeek(weekStart, { force } = {}) {
  return cachedRequest(
    `payroll:week:${weekStart}`,
    PAYROLL_TTL,
    async () => {
      const data = await api('getPayrollForWeek', { weekStart })
      return {
        weekStart: data?.week_start || weekStart,
        payroll: data?.payroll || [],
        orders: data?.orders || [],
        fuel: data?.fuel || [],
      }
    },
    { force }
  )
}

// A worker's own payroll record for a week (or null) — paid / received state.
export async function getMyPayroll(weekStart, { force } = {}) {
  return cachedRequest(
    `payroll:me:${weekStart}`,
    PAYROLL_TTL,
    async () => {
      const data = await api('getMyPayroll', { weekStart })
      return data?.payroll || null
    },
    { force }
  )
}

// Admin: mark (or unmark) a worker's weekly salary as paid, snapshotting the amounts.
export async function setPayrollPaid(payload) {
  const res = await api('setPayrollPaid', payload)
  invalidatePrefix('payroll')
  return res
}

// Worker: confirm they received their pay for a week.
export async function confirmPayrollReceived(weekStart) {
  const res = await api('confirmPayrollReceived', { weekStart })
  invalidatePrefix('payroll')
  return res
}
