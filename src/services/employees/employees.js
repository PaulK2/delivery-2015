// Employees service (spec §51, §73).
import { api } from '../api/client.js'
import { cachedRequest, invalidate } from '../api/cache.js'

const TTL = 5 * 60 * 1000 // employees rarely change — cache for several minutes

export async function getEmployees({ force } = {}) {
  return cachedRequest(
    'employees',
    TTL,
    async () => {
      const data = await api('getEmployees', {})
      return data?.employees || []
    },
    { force }
  )
}

// Admin: create or update an employee (name, role, active). New employees have no
// password — they create their own on first login (spec §73).
export async function saveEmployee(employee) {
  const res = await api('saveEmployee', { employee })
  invalidate('employees')
  return res
}

// Admin: reset an employee's password. This clears the stored hash and marks the
// account as requiring setup, so the user creates a new password on next login.
// The admin never sets or sees the password.
export async function resetEmployeePassword(employeeId) {
  const res = await api('resetEmployeePassword', { employeeId })
  invalidate('employees')
  return res
}

// Admin: permanently delete an employee.
export async function deleteEmployee(employeeId) {
  const res = await api('deleteEmployee', { employeeId })
  invalidate('employees')
  return res
}
